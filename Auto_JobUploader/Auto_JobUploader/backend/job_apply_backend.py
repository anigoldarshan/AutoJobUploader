"""
Job Auto-Apply Backend - FastAPI
Searches LinkedIn & Naukri for roles and auto-applies.
Uses SQLite for persistent application tracking.
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import asyncio
import time
import random
import logging
import sqlite3
import re
import requests as http_requests
from pathlib import Path
from datetime import datetime
from chrome_manager import setup_chrome_driver, verify_chrome_installation

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Job Auto-Apply API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────
# SQLite — persistent application tracking
# ──────────────────────────────────────────
DB_PATH = Path(__file__).parent / "applications.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS applications (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                company     TEXT NOT NULL,
                location    TEXT,
                platform    TEXT NOT NULL,
                url         TEXT,
                status      TEXT NOT NULL,
                method      TEXT DEFAULT 'auto',
                experience  TEXT,
                salary      TEXT,
                applied_at  TEXT NOT NULL
            )
        """)
        conn.commit()
    logger.info(f"✅ Database ready: {DB_PATH}")

init_db()

def db_save_application(job_id, title, company, location, platform, url,
                         status, method="auto", experience=None, salary=None):
    with get_db() as conn:
        conn.execute("""
            INSERT INTO applications
                (id, title, company, location, platform, url, status, method, experience, salary, applied_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET status=excluded.status, applied_at=excluded.applied_at
        """, (job_id, title, company, location, platform, url,
              status, method, experience, salary, datetime.now().isoformat()))
        conn.commit()

def db_get_log(limit=200):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM applications ORDER BY applied_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]

def db_get_stats():
    with get_db() as conn:
        total   = conn.execute("SELECT COUNT(*) FROM applications").fetchone()[0]
        applied = conn.execute("SELECT COUNT(*) FROM applications WHERE status IN ('applied','manually-applied')").fetchone()[0]
        auto    = conn.execute("SELECT COUNT(*) FROM applications WHERE method='auto'").fetchone()[0]
        manual  = conn.execute("SELECT COUNT(*) FROM applications WHERE method='manual'").fetchone()[0]
        failed  = conn.execute("SELECT COUNT(*) FROM applications WHERE status='failed'").fetchone()[0]
    return {"total": total, "applied": applied, "auto_applied": auto,
            "manually_applied": manual, "failed": failed}

# ──────────────────────────────────────────
# Models
# ──────────────────────────────────────────

class Credentials(BaseModel):
    platform: str           # "linkedin" | "naukri"
    email: str
    password: str

class SearchConfig(BaseModel):
    role: str = "Python Developer"
    location: str = "India"
    experience: str = "0-3"
    max_jobs: int = 20

class Job(BaseModel):
    id: str
    title: str
    company: str
    location: str
    experience: str
    salary: Optional[str]
    posted: str
    platform: str
    url: str
    status: str = "pending"

class MarkAppliedRequest(BaseModel):
    job_id: str
    title: str
    company: str
    location: str
    platform: str
    url: str
    experience: Optional[str] = None
    salary: Optional[str] = None

class LinkedInMessageRequest(BaseModel):
    email: str
    password: str
    job_title: str
    company: str
    job_url: str

class ApplyWithJobRequest(BaseModel):
    """Apply request that carries full job data — no job_store lookup needed."""
    platform: str
    email: str
    password: str
    job_id: str
    title: str
    company: str
    location: str
    url: str
    experience: Optional[str] = None
    salary: Optional[str] = None

class BulkApplyRequest(BaseModel):
    platform: str
    credentials: Credentials
    config: SearchConfig

# ──────────────────────────────────────────
# In-memory job store (current search session only)
# ──────────────────────────────────────────
job_store: dict[str, Job] = {}
session_tokens: dict[str, str] = {}

# ──────────────────────────────────────────
# Utility: Human-like delay
# ──────────────────────────────────────────
def human_delay(min_s=1.5, max_s=3.5):
    time.sleep(random.uniform(min_s, max_s))


# ──────────────────────────────────────────
# LinkedIn Automation (Selenium)
# ──────────────────────────────────────────
# Maps user-selected experience range → LinkedIn f_E experience level codes
# f_E=1 Internship, 2 Entry level, 3 Associate, 4 Mid-Senior, 5 Director, 6 Executive
_EXPERIENCE_FILTER: dict = {
    "0-1":  "1,2",   # Fresher  → Internship + Entry level
    "0-3":  "1,2",   # Junior   → Internship + Entry level
    "2-5":  "3,4",   # Mid      → Associate + Mid-Senior
    "5-10": "4,5",   # Senior   → Mid-Senior + Director
}

_CITY_ALIASES: dict = {
    # key = what the user might type → canonical LinkedIn location string
    "banglore":    "Bengaluru, Karnataka, India",
    "bangalore":   "Bengaluru, Karnataka, India",
    "bengaluru":   "Bengaluru, Karnataka, India",
    "mumbai":      "Mumbai, Maharashtra, India",
    "bombay":      "Mumbai, Maharashtra, India",
    "pune":        "Pune, Maharashtra, India",
    "delhi":       "Delhi, India",
    "new delhi":   "New Delhi, Delhi, India",
    "hyderabad":   "Hyderabad, Telangana, India",
    "chennai":     "Chennai, Tamil Nadu, India",
    "madras":      "Chennai, Tamil Nadu, India",
    "kolkata":     "Kolkata, West Bengal, India",
    "calcutta":    "Kolkata, West Bengal, India",
    "ahmedabad":   "Ahmedabad, Gujarat, India",
    "noida":       "Noida, Uttar Pradesh, India",
    "gurgaon":     "Gurugram, Haryana, India",
    "gurugram":    "Gurugram, Haryana, India",
    "remote":      "India",
    "india":       "India",
}

def _normalize_location(raw: str) -> str:
    """Return the canonical LinkedIn location string for a user-typed city name."""
    key = raw.strip().lower()
    return _CITY_ALIASES.get(key, raw.strip())

def _location_matches(job_loc: str, search_loc: str) -> bool:
    """Return True if the job's location is relevant to the searched location."""
    if not job_loc:
        return True
    jl = job_loc.lower()
    # Accept any word from the searched location that's at least 3 chars long
    for word in search_loc.lower().split():
        if len(word) >= 3 and word in jl:
            return True
    # Accept common alias words (bangalore ↔ bengaluru)
    alias_groups = [
        {"bangalore", "bengaluru", "banglore", "karnataka"},
        {"mumbai", "bombay", "maharashtra"},
        {"delhi", "new delhi", "ncr"},
        {"hyderabad", "telangana"},
        {"chennai", "madras", "tamil"},
        {"kolkata", "calcutta", "bengal"},
        {"pune", "maharashtra"},
        {"gurugram", "gurgaon", "haryana"},
        {"noida", "uttar pradesh"},
        {"ahmedabad", "gujarat"},
    ]
    sl = search_loc.lower()
    for group in alias_groups:
        if any(a in sl for a in group):
            if any(a in jl for a in group):
                return True
    return False


def linkedin_login_and_search(email: str, password: str, config: SearchConfig) -> List[Job]:
    """
    Search LinkedIn jobs via the public guest HTTP API — no Selenium, no login needed.
    Normalises the location string so LinkedIn filters correctly (e.g. "Banglore" →
    "Bengaluru, Karnataka, India"), then post-filters results to the searched city.
    """
    import urllib.parse
    from bs4 import BeautifulSoup

    # Normalise to the canonical form LinkedIn understands
    canonical_location = _normalize_location(config.location)
    exp_filter = _EXPERIENCE_FILTER.get(config.experience.strip(), "")
    logger.info(
        f"LinkedIn search: role='{config.role}'  location='{config.location}' → '{canonical_location}'"
        f"  experience='{config.experience}' → f_E='{exp_filter}'"
    )

    jobs: List[Job] = []
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://www.linkedin.com/jobs/search/",
    }

    fetched   = 0
    start     = 0
    batch_sz  = 25
    max_fetch = min(config.max_jobs, 100)

    while fetched < max_fetch:
        api_url = (
            "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
            f"?keywords={urllib.parse.quote(config.role)}"
            f"&location={urllib.parse.quote(canonical_location)}"
            f"&start={start}"
            f"&count={batch_sz}"
            "&sortBy=DD"
            "&f_TPR=r3600"      # last 1 hour
            + (f"&f_E={exp_filter}" if exp_filter else "")
        )
        logger.info(f"LinkedIn: GET {api_url}")

        try:
            resp = http_requests.get(api_url, headers=headers, timeout=20)
        except Exception as e:
            raise Exception(f"LinkedIn request failed: {e}")

        logger.info(f"LinkedIn: status={resp.status_code}  bytes={len(resp.content)}")

        if resp.status_code == 429:
            raise Exception("LinkedIn rate-limited this request. Wait a minute and try again.")
        if resp.status_code != 200:
            if start == 0:
                raise Exception(f"LinkedIn returned HTTP {resp.status_code}. Try again shortly.")
            break

        soup = BeautifulSoup(resp.text, "html.parser")
        cards = soup.find_all("li")
        if not cards:
            break

        batch_added = 0
        for card in cards:
            title_el = (card.find("h3", class_="base-search-card__title") or
                        card.find("h3", class_="job-search-card__title") or
                        card.find("h3"))
            title = title_el.get_text(strip=True) if title_el else ""

            company_el = (card.find("h4", class_="base-search-card__subtitle") or
                          card.find("a",  class_="job-search-card__company-name") or
                          card.find("h4"))
            company = company_el.get_text(strip=True) if company_el else ""

            loc_el = (card.find("span", class_="job-search-card__location") or
                      card.find("span", class_="base-search-card__metadata"))
            job_location = loc_el.get_text(strip=True) if loc_el else ""

            link_el = (card.find("a", class_="base-card__full-link") or
                       card.find("a", href=lambda h: h and "/jobs/view/" in h))
            job_url = link_el["href"].split("?")[0] if link_el else "#"

            if not title and not company:
                continue

            # Post-filter: skip jobs that are clearly from a different location
            if job_location and not _location_matches(job_location, canonical_location):
                logger.debug(f"LinkedIn: skipping {title} — location '{job_location}' != '{canonical_location}'")
                continue

            idx = len(jobs)
            jobs.append(Job(
                id=f"li_{idx}_{int(time.time())}",
                title=title or "N/A",
                company=company or "N/A",
                location=job_location or canonical_location,
                experience=config.experience + " yrs",
                salary=None,
                posted="Recent",
                platform="linkedin",
                url=job_url,
                status="pending"
            ))
            logger.info(f"LinkedIn: [{idx+1}] {title} @ {company} — {job_location}")
            batch_added += 1
            fetched += 1
            if fetched >= max_fetch:
                break

        if batch_added == 0:
            break
        start += batch_sz

    logger.info(f"LinkedIn: {len(jobs)} jobs for '{config.role}' in '{canonical_location}'")
    return jobs


def linkedin_easy_apply(job: Job, email: str, password: str) -> bool:
    """
    Opens a LinkedIn job page and clicks Easy Apply.
    Returns True if successfully applied.
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    try:
        driver = setup_chrome_driver()
    except Exception as e:
        logger.error(f"ChromeDriver initialization failed: {e}")
        return False
        
    wait = WebDriverWait(driver, 15)

    try:
        # ── LOGIN ──
        driver.get("https://www.linkedin.com/login")
        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "username")))
        driver.find_element(By.ID, "username").send_keys(email)
        driver.find_element(By.ID, "password").send_keys(password)
        driver.find_element(By.XPATH, "//button[@type='submit']").click()

        # Wait until we're actually on the feed — not just a fixed sleep
        try:
            WebDriverWait(driver, 12).until(lambda d:
                "feed" in d.current_url or "mynetwork" in d.current_url
                or "checkpoint" in d.current_url)
        except Exception:
            pass

        if "checkpoint" in driver.current_url or "challenge" in driver.current_url:
            logger.warning("LinkedIn security check triggered during apply")
            return False

        logger.info(f"LinkedIn: Navigating to job page: {job.url}")

        # ── JOB PAGE ──
        driver.get(job.url)

        # Wait for the job details panel to fully render
        try:
            WebDriverWait(driver, 12).until(lambda d:
                d.execute_script("return document.readyState") == "complete")
        except Exception:
            pass
        human_delay(2, 3)

        # ── FIND EASY APPLY BUTTON ──
        # CSS selectors first, then XPath text-match as ultimate fallback
        easy_apply_btn = None

        css_selectors = [
            "button[aria-label*='Easy Apply']",
            "button[aria-label*='easy apply']",
            "button.jobs-apply-button--top-card",
            "button.jobs-apply-button",
            "[data-control-name='jobdetails_topcard_inapply']",
            "button.artdeco-button--primary[data-live-test-job-apply-button]",
            "div.jobs-apply-button--top-card button",
        ]
        for sel in css_selectors:
            try:
                easy_apply_btn = WebDriverWait(driver, 3).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, sel)))
                logger.info(f"LinkedIn: Found Easy Apply via CSS: {sel}")
                break
            except Exception:
                continue

        # XPath fallback — match button text
        if not easy_apply_btn:
            for xpath in [
                "//button[contains(., 'Easy Apply')]",
                "//button[contains(@aria-label, 'Easy Apply')]",
                "//button[contains(@aria-label, 'easy apply')]",
            ]:
                try:
                    easy_apply_btn = WebDriverWait(driver, 3).until(
                        EC.element_to_be_clickable((By.XPATH, xpath)))
                    logger.info(f"LinkedIn: Found Easy Apply via XPath: {xpath}")
                    break
                except Exception:
                    continue

        if not easy_apply_btn:
            # Save screenshot so the user can see what's on the page
            try:
                ss_path = f"easy_apply_not_found_{int(time.time())}.png"
                driver.save_screenshot(ss_path)
                logger.warning(f"Easy Apply button not found for {job.url} — screenshot: {ss_path}")
            except Exception:
                logger.warning(f"Easy Apply button not found for {job.url}")
            return False

        easy_apply_btn.click()
        human_delay(2, 3)

        # ── CLICK THROUGH MODAL (Next → Review → Submit) ──
        for step in range(6):
            clicked = False
            # Try submit first (highest priority)
            for xpath in [
                "//button[@aria-label='Submit application']",
                "//button[contains(@aria-label,'Submit')]",
                "//button[contains(.,'Submit application')]",
            ]:
                try:
                    btn = WebDriverWait(driver, 3).until(
                        EC.element_to_be_clickable((By.XPATH, xpath)))
                    btn.click()
                    human_delay(2, 3)
                    clicked = True
                    break
                except Exception:
                    continue

            if not clicked:
                for xpath in [
                    "//button[@aria-label='Continue to next step']",
                    "//button[@aria-label='Review your application']",
                    "//button[contains(@aria-label,'Next')]",
                    "//button[@data-easy-apply-next-button]",
                ]:
                    try:
                        btn = WebDriverWait(driver, 3).until(
                            EC.element_to_be_clickable((By.XPATH, xpath)))
                        btn.click()
                        human_delay(1.5, 2.5)
                        clicked = True
                        break
                    except Exception:
                        continue

            if not clicked:
                break  # no more steps found

        page_src = driver.page_source
        if "application submitted" in page_src.lower() or "applied" in driver.current_url:
            logger.info(f"✅ Applied to {job.title} @ {job.company}")
            return True

        return True  # optimistic

    except Exception as e:
        logger.error(f"LinkedIn apply error: {e}")
        return False
    finally:
        driver.quit()


# ──────────────────────────────────────────
# Naukri Automation (Selenium)
# ──────────────────────────────────────────
def naukri_login_and_search(email: str, password: str, config: SearchConfig) -> List[Job]:
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    try:
        driver = setup_chrome_driver()
    except Exception as e:
        logger.error(f"ChromeDriver initialization failed: {e}")
        raise Exception(f"Failed to start browser automation: {str(e)}.")

    wait = WebDriverWait(driver, 15)
    jobs: List[Job] = []

    def dismiss_popups():
        """Close cookie banners, chat widgets, and login nudges."""
        for sel in [
            "button#login_Layer",        # login popup dismiss
            "button.cross-btn",
            "[class*='close']",
            "[aria-label='Close']",
            "button.commonModal__close",
        ]:
            try:
                btn = driver.find_element(By.CSS_SELECTOR, sel)
                if btn.is_displayed():
                    btn.click()
            except Exception:
                pass

    try:
        # ── LOGIN ──
        logger.info("Naukri: Logging in...")
        driver.get("https://www.naukri.com/nlogin/login")
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR,
            "#usernameField, input[placeholder*='Email'], input[type='email']")))
        dismiss_popups()

        # Email field
        for sel in ["#usernameField", "input[placeholder*='Email']", "input[type='email']"]:
            try:
                f = driver.find_element(By.CSS_SELECTOR, sel)
                f.clear(); f.send_keys(email); break
            except Exception:
                pass

        # Password field
        for sel in ["#passwordField", "input[placeholder*='Password']", "input[type='password']"]:
            try:
                f = driver.find_element(By.CSS_SELECTOR, sel)
                f.clear(); f.send_keys(password); break
            except Exception:
                pass

        # Submit
        for sel in ["button[type='submit']", "button.loginButton", "input[type='submit']"]:
            try:
                driver.find_element(By.CSS_SELECTOR, sel).click(); break
            except Exception:
                pass

        # Wait for login to complete
        try:
            WebDriverWait(driver, 8).until(lambda d:
                "nlogin" not in d.current_url or "myapps" in d.current_url)
        except Exception:
            pass
        human_delay(1, 2)
        dismiss_popups()

        # ── SEARCH ──
        import urllib.parse
        keyword_slug = config.role.replace(" ", "-").lower()
        exp = config.experience.replace(" ", "")
        # Try the SEO URL first (most reliable), fall back to query-param URL
        search_url = (
            f"https://www.naukri.com/{keyword_slug}-jobs"
            f"?k={urllib.parse.quote(config.role)}"
            f"&experience={exp}"
            f"&jobAge=7"    # posted in last 7 days
        )
        logger.info(f"Naukri: Searching {search_url}")
        driver.get(search_url)

        # Wait for the page to load results
        try:
            WebDriverWait(driver, 12).until(lambda d:
                d.execute_script("return document.readyState") == "complete")
        except Exception:
            pass
        human_delay(2, 3)
        dismiss_popups()

        # Scroll to trigger lazy-load
        for _ in range(3):
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            human_delay(1.0, 1.5)
        driver.execute_script("window.scrollTo(0, 0);")
        human_delay(0.5, 1)

        # ── FIND CARDS — multiple selectors for Naukri's evolving HTML ──
        card_selectors = [
            "div.srp-jobtuple-wrapper",          # current (2024-25)
            "div[class*='srp-jobtuple']",
            "div.cust-job-tuple",
            "article.jobTuple",                  # older layout
            "div.jobTuple",
            "li.jobTuple",
            "div[class*='jobTuple']",
        ]
        cards = []
        used_sel = None
        for sel in card_selectors:
            found = driver.find_elements(By.CSS_SELECTOR, sel)
            if found:
                cards = found
                used_sel = sel
                break

        logger.info(f"Naukri: Found {len(cards)} job cards" +
                    (f" using '{used_sel}'" if used_sel else " (no selector matched)"))

        if not cards:
            # Save HTML for debugging
            src_preview = driver.page_source[:3000]
            logger.info(f"Naukri: Page source preview:\n{src_preview}")

        for i, card in enumerate(cards[:config.max_jobs]):
            try:
                _ = card.tag_name  # stale check
            except Exception:
                continue
            try:
                # Title
                title = "N/A"
                for sel in ["a.title", "a[class*='title']", "a.jobTitle",
                            "h2 a", "h3 a", "a[title]"]:
                    try:
                        el = card.find_element(By.CSS_SELECTOR, sel)
                        title = el.text.strip() or el.get_attribute("title") or "N/A"
                        if title and title != "N/A": break
                    except Exception:
                        pass

                # Company
                company = "N/A"
                for sel in ["a.comp-name", "span.comp-name", "a[class*='comp']",
                            "a.subTitle", "span.companyName", "a.company-name"]:
                    try:
                        company = card.find_element(By.CSS_SELECTOR, sel).text.strip()
                        if company: break
                    except Exception:
                        pass

                # Experience
                experience = config.experience + " yrs"
                for sel in ["span.expwdth", "span[class*='exp']", "li.experience",
                            "span.experience", "div[class*='exp']"]:
                    try:
                        v = card.find_element(By.CSS_SELECTOR, sel).text.strip()
                        if v: experience = v; break
                    except Exception:
                        pass

                # Location
                location = config.location
                for sel in ["span.locWdth", "span[class*='loc']", "li.location",
                            "span.location", "a.loc-link"]:
                    try:
                        v = card.find_element(By.CSS_SELECTOR, sel).text.strip()
                        if v: location = v; break
                    except Exception:
                        pass

                # Salary
                salary = None
                for sel in ["span.sal", "span[class*='sal']", "span.salary",
                            "li.salary", "span[class*='Salary']"]:
                    try:
                        v = card.find_element(By.CSS_SELECTOR, sel).text.strip()
                        if v: salary = v; break
                    except Exception:
                        pass

                # URL
                job_url = "#"
                for sel in ["a.title", "a[class*='title']", "a.jobTitle", "h2 a", "h3 a"]:
                    try:
                        href = card.find_element(By.CSS_SELECTOR, sel).get_attribute("href")
                        if href: job_url = href; break
                    except Exception:
                        pass

                if title == "N/A" and company == "N/A":
                    continue

                jobs.append(Job(
                    id=f"nk_{i}_{int(time.time())}",
                    title=title, company=company, location=location,
                    experience=experience, salary=salary,
                    posted="Recent", platform="naukri",
                    url=job_url, status="pending"
                ))
                logger.info(f"Naukri: Job {i+1}: {title} @ {company}")
            except Exception as e:
                logger.warning(f"Naukri: Could not parse card {i}: {e}")

    finally:
        driver.quit()

    return jobs


def naukri_apply(job: Job, email: str, password: str) -> bool:
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    try:
        driver = setup_chrome_driver()
    except Exception as e:
        logger.error(f"ChromeDriver initialization failed: {e}")
        return False
        
    wait = WebDriverWait(driver, 15)

    try:
        driver.get("https://www.naukri.com/nlogin/login")
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR,
            "#usernameField, input[type='email']")))
        for sel in ["#usernameField", "input[type='email']"]:
            try: f = driver.find_element(By.CSS_SELECTOR, sel); f.clear(); f.send_keys(email); break
            except Exception: pass
        for sel in ["#passwordField", "input[type='password']"]:
            try: f = driver.find_element(By.CSS_SELECTOR, sel); f.clear(); f.send_keys(password); break
            except Exception: pass
        for sel in ["button[type='submit']", "button.loginButton"]:
            try: driver.find_element(By.CSS_SELECTOR, sel).click(); break
            except Exception: pass
        try:
            WebDriverWait(driver, 8).until(lambda d: "nlogin" not in d.current_url)
        except Exception:
            pass
        human_delay(1, 2)

        logger.info(f"Naukri: Navigating to job page: {job.url}")
        driver.get(job.url)
        try:
            WebDriverWait(driver, 10).until(lambda d:
                d.execute_script("return document.readyState") == "complete")
        except Exception:
            pass
        human_delay(1, 2)

        # CSS selectors
        apply_btn = None
        css_selectors = [
            "button#apply-button",
            "button.apply-button",
            "button[class*='apply-btn']",
            "a.apply-button",
            "div.apply-button button",
            "button[title*='Apply']",
            "button[class*='applyBtn']",
            "a[class*='applyBtn']",
        ]
        for sel in css_selectors:
            try:
                apply_btn = WebDriverWait(driver, 3).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, sel)))
                logger.info(f"Naukri: Found Apply button via CSS: {sel}")
                break
            except Exception:
                pass

        # XPath text fallback
        if not apply_btn:
            for xpath in [
                "//button[contains(., 'Apply')]",
                "//a[contains(., 'Apply')]",
                "//button[contains(@class,'apply')]",
            ]:
                try:
                    apply_btn = WebDriverWait(driver, 3).until(
                        EC.element_to_be_clickable((By.XPATH, xpath)))
                    logger.info(f"Naukri: Found Apply button via XPath: {xpath}")
                    break
                except Exception:
                    pass

        if not apply_btn:
            try:
                ss_path = f"naukri_apply_not_found_{int(time.time())}.png"
                driver.save_screenshot(ss_path)
                logger.warning(f"Apply button not found on Naukri — screenshot: {ss_path}")
            except Exception:
                logger.warning("Apply button not found on Naukri job page")
            return False

        apply_btn.click()
        human_delay(2, 3)
        logger.info(f"✅ Naukri Applied: {job.title} @ {job.company}")
        return True

    except Exception as e:
        logger.error(f"Naukri apply error: {e}")
        return False
    finally:
        driver.quit()


# ──────────────────────────────────────────
# Background Tasks
# ──────────────────────────────────────────
def run_bulk_apply(platform: str, credentials: Credentials, config: SearchConfig):
    """Background task: search + apply to all found jobs"""
    logger.info(f"🚀 Starting bulk apply on {platform} for '{config.role}'")

    if platform == "linkedin":
        jobs = linkedin_login_and_search(credentials.email, credentials.password, config)
    else:
        jobs = naukri_login_and_search(credentials.email, credentials.password, config)

    for j in jobs:
        job_store[j.id] = j

    applied = 0
    failed = 0

    for job_id, job in list(job_store.items()):
        if job.platform != platform or job.status != "pending":
            continue

        job.status = "applying"
        try:
            if platform == "linkedin":
                success = linkedin_easy_apply(job, credentials.email, credentials.password)
            else:
                success = naukri_apply(job, credentials.email, credentials.password)

            job.status = "applied" if success else "failed"
            if success:
                applied += 1
            else:
                failed += 1
        except Exception as e:
            job.status = "failed"
            failed += 1
            logger.error(f"Error applying to {job.title}: {e}")

        apply_log.append({
            "job_id": job_id,
            "title": job.title,
            "company": job.company,
            "status": job.status,
            "timestamp": datetime.now().isoformat()
        })

        human_delay(5, 10)  # Rate limiting

    logger.info(f"✅ Bulk apply complete: {applied} applied, {failed} failed")


# ──────────────────────────────────────────
# Credential validators (login only, no search)
# ──────────────────────────────────────────

def _is_chrome_crash(err: Exception) -> bool:
    s = str(err)
    return (
        not s.strip()
        or s.strip() == "Message:"
        or "GetHandleVerifier" in s
        or "session not created" in s.lower()
        or "chrome not reachable" in s.lower()
        or "disconnected" in s.lower()
        or "failed to start" in s.lower()
    )


def _linkedin_validate(email: str, password: str) -> dict:
    """
    Validate LinkedIn credentials by opening a real Chrome browser and logging in.
    Uses time.sleep instead of WebDriverWait to avoid GetHandleVerifier crashes.
    """
    driver = None
    try:
        logger.info("LinkedIn validate: launching Chrome (headless)...")
        driver = setup_chrome_driver(headless=True)
        driver.get("https://www.linkedin.com/login")
        time.sleep(3)  # let page fully render before touching DOM

        # Fill credentials via JavaScript — avoids WebDriverWait polling crashes
        driver.execute_script("""
            var u = document.getElementById('username');
            var p = document.getElementById('password');
            if (u) { u.value = arguments[0]; u.dispatchEvent(new Event('input', {bubbles:true})); }
            if (p) { p.value = arguments[1]; p.dispatchEvent(new Event('input', {bubbles:true})); }
        """, email, password)
        time.sleep(0.5)

        driver.execute_script("""
            var btn = document.querySelector('button[type="submit"]');
            if (btn) btn.click();
        """)

        time.sleep(7)  # wait for LinkedIn to redirect after submit

        url = driver.execute_script("return window.location.href") or ""
        logger.info(f"LinkedIn validate: post-login url = {url}")

        if "/feed" in url or "/mynetwork" in url:
            return {"valid": True}

        if any(x in url for x in ("checkpoint", "challenge", "verify")):
            raise HTTPException(status_code=401,
                detail="🔐 LinkedIn security check required. "
                       "Please log into LinkedIn manually in your browser first, then try again.")

        raise HTTPException(status_code=401,
            detail="❌ Wrong email or password. Please check and try again.")

    except HTTPException:
        raise
    except Exception as e:
        err = str(e)
        logger.error(f"LinkedIn validate error: {err}")
        if _is_chrome_crash(e):
            raise HTTPException(status_code=500,
                detail="Chrome crashed during login check. Please try again.")
        raise HTTPException(status_code=500,
            detail=f"Browser error during login. ({err[:120]})")
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


def _naukri_validate(email: str, password: str) -> dict:
    """
    Validate Naukri credentials by opening a real Chrome browser and logging in.
    Uses time.sleep instead of WebDriverWait to avoid GetHandleVerifier crashes.
    """
    driver = None
    try:
        logger.info("Naukri validate: launching Chrome (headless)...")
        driver = setup_chrome_driver(headless=True)
        driver.get("https://www.naukri.com/nlogin/login")
        time.sleep(3)

        driver.execute_script("""
            var e = document.querySelector('#usernameField, input[type="email"], input[placeholder*="Email"]');
            var p = document.querySelector('#passwordField, input[type="password"]');
            if (e) { e.value = arguments[0]; e.dispatchEvent(new Event('input', {bubbles:true})); }
            if (p) { p.value = arguments[1]; p.dispatchEvent(new Event('input', {bubbles:true})); }
        """, email, password)
        time.sleep(0.5)

        driver.execute_script("""
            var btn = document.querySelector('button[type="submit"], .loginButton, input[type="submit"]');
            if (btn) btn.click();
        """)

        time.sleep(7)

        url = driver.execute_script("return window.location.href") or ""
        logger.info(f"Naukri validate: post-login url = {url}")

        # Naukri redirects away from /nlogin on success
        if "nlogin" not in url and "login" not in url.lower():
            return {"valid": True}

        raise HTTPException(status_code=401,
            detail="❌ Wrong email or password. Please check and try again.")

    except HTTPException:
        raise
    except Exception as e:
        err = str(e)
        logger.error(f"Naukri validate error: {err}")
        if _is_chrome_crash(e):
            raise HTTPException(status_code=500,
                detail="Chrome crashed during login check. Please try again.")
        raise HTTPException(status_code=500,
            detail=f"Browser error during login. ({err[:120]})")
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass




# ──────────────────────────────────────────
# API ROUTES
# ──────────────────────────────────────────


@app.post("/api/linkedin-message")
def linkedin_send_message(req: LinkedInMessageRequest):
    """
    Navigate to a LinkedIn job page, find 'People you can reach out to',
    and send each of them a personalized interest message.
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys

    driver = None
    try:
        # Non-headless for message — LinkedIn blocks headless login more aggressively
        # for account-level actions vs. the public search API.
        driver = setup_chrome_driver(headless=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Browser failed to start: {str(e)[:100]}")

    try:
        # ── LOGIN ──────────────────────────────────────────────────────────
        driver.get("https://www.linkedin.com/login")
        time.sleep(4)   # let page fully render

        # Same JS pattern as _linkedin_validate (proven to work)
        driver.execute_script("""
            var u = document.getElementById('username');
            var p = document.getElementById('password');
            if (u) { u.value = arguments[0]; u.dispatchEvent(new Event('input', {bubbles:true})); }
            if (p) { p.value = arguments[1]; p.dispatchEvent(new Event('input', {bubbles:true})); }
        """, req.email, req.password)
        time.sleep(0.5)

        driver.execute_script(
            "var b = document.querySelector('button[type=\"submit\"]'); if(b) b.click();"
        )
        time.sleep(8)   # wait for redirect

        url = driver.execute_script("return window.location.href") or ""
        logger.info(f"LinkedIn Message: post-login url = {url}")

        if "linkedin.com/login" in url:
            raise HTTPException(status_code=401, detail="❌ Login failed. Check credentials.")
        if any(x in url for x in ("checkpoint", "challenge", "verify")):
            raise HTTPException(status_code=401, detail="🔐 Security check required. Log in manually first.")

        # ── JOB PAGE ───────────────────────────────────────────────────────
        logger.info(f"LinkedIn Message: opening job page {req.job_url}")
        driver.get(req.job_url)
        time.sleep(5)

        # Scroll to reveal the people section
        for scroll_to in [600, 1200, 1800, 0]:
            driver.execute_script(f"window.scrollTo(0, {scroll_to});")
            time.sleep(1.5)

        # ── FIND MESSAGE BUTTONS ────────────────────────────────────────────
        msg_button_sels = (
            'button[aria-label*="Message"], '
            'button.message-anywhere-button, '
            'button[aria-label*="message"], '
            'a[aria-label*="Message"], '
            'button[data-control-name*="message"]'
        )
        msg_buttons = driver.find_elements(By.CSS_SELECTOR, msg_button_sels)
        logger.info(f"LinkedIn Message: found {len(msg_buttons)} message button(s)")

        if not msg_buttons:
            # Try to at least name who's there for a helpful error
            found_names = driver.execute_script("""
                var sels = ['.jobs-poster__name','.hirer-card__hirer-information strong',
                            'span[aria-hidden="true"]','.artdeco-entity-lockup__title span'];
                var names = [];
                sels.forEach(function(s){
                    document.querySelectorAll(s).forEach(function(el){
                        var t=el.textContent.trim();
                        if(t && t.length<60 && !names.includes(t)) names.push(t);
                    });
                });
                return names.slice(0,5);
            """)
            detail = "No 'People you can reach out to' found on this job page."
            if found_names:
                detail += f" Saw names: {', '.join(found_names)} — but no Message button."
            raise HTTPException(status_code=404, detail=detail)

        sender_name = req.email.split("@")[0].replace(".", " ").title()
        messaged, failed = [], []

        for i, btn in enumerate(msg_buttons[:3]):   # message up to 3 people
            # Resolve person name from button label or nearby DOM
            person_name = driver.execute_script("""
                var btn = arguments[0];
                var label = btn.getAttribute('aria-label') || '';
                var m = label.match(/[Mm]essage\\s+(.+)/);
                if (m) return m[1].trim();
                var card = btn.closest('li, [class*="hirer"], [class*="poster"], [class*="insight"]');
                if (card) {
                    var el = card.querySelector('[class*="name"], strong, h3, span[aria-hidden="true"]');
                    if (el) return el.textContent.trim();
                }
                return 'there';
            """, btn)

            msg_text = (
                f"Hi {person_name}, I came across the {req.job_title} position at {req.company} "
                f"and I'm genuinely excited about this opportunity.\n\n"
                f"With my background and passion for this field, I believe I could be a strong "
                f"fit for the team. I'd love to connect briefly to learn more about the role and "
                f"share how I could contribute.\n\n"
                f"Would you be open to a quick chat? Thank you so much for your time!\n\n"
                f"Best regards,\n{sender_name}"
            )

            try:
                # Scroll button into view and click
                driver.execute_script("arguments[0].scrollIntoView({block:'center'});", btn)
                time.sleep(0.5)
                driver.execute_script("arguments[0].click();", btn)
                time.sleep(3)

                # Find the contenteditable message box (LinkedIn chat overlay)
                textarea = None
                for sel in [
                    'div.msg-form__contenteditable[contenteditable="true"]',
                    '.msg-form__contenteditable',
                    'div[contenteditable="true"][data-placeholder]',
                    'div[role="textbox"]',
                ]:
                    els = driver.find_elements(By.CSS_SELECTOR, sel)
                    if els:
                        textarea = els[-1]
                        break

                if not textarea:
                    logger.warning(f"LinkedIn Message: no textarea found for {person_name}")
                    failed.append(person_name)
                    # Try closing the modal
                    driver.execute_script("""
                        var c=document.querySelector('button[aria-label="Close"],.msg-overlay-bubble-header__controls button');
                        if(c) c.click();
                    """)
                    continue

                # Click to focus, then inject text via execCommand (works in contenteditable)
                driver.execute_script("arguments[0].click(); arguments[0].focus();", textarea)
                time.sleep(0.5)
                driver.execute_script(
                    "arguments[0].textContent='';"
                    "document.execCommand('selectAll',false,null);"
                    "document.execCommand('insertText',false,arguments[1]);",
                    textarea, msg_text
                )
                time.sleep(1)

                # Click Send button
                sent = False
                for send_sel in [
                    'button.msg-form__send-button',
                    'button[aria-label="Send"]',
                    'button[type="submit"].msg-form__send-button',
                ]:
                    send_btns = driver.find_elements(By.CSS_SELECTOR, send_sel)
                    if send_btns:
                        driver.execute_script("arguments[0].click();", send_btns[-1])
                        time.sleep(2)
                        sent = True
                        break

                if not sent:
                    try:
                        textarea.send_keys(Keys.CONTROL + Keys.RETURN)
                        time.sleep(2)
                        sent = True
                    except Exception:
                        pass

                if sent:
                    messaged.append(person_name)
                    logger.info(f"LinkedIn Message: ✅ Sent to {person_name}")
                else:
                    failed.append(person_name)

                time.sleep(2)

            except Exception as e:
                logger.warning(f"LinkedIn Message: error for {person_name}: {e}")
                failed.append(person_name)

        return {"messaged": messaged, "failed": failed, "total_found": len(msg_buttons)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LinkedIn Message error: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)[:150]}")
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


@app.post("/api/validate-credentials")
def validate_credentials(creds: Credentials):
    """Validate credentials by actually logging in via Selenium."""
    if creds.platform == "linkedin":
        return _linkedin_validate(creds.email, creds.password)
    elif creds.platform == "naukri":
        return _naukri_validate(creds.email, creds.password)
    raise HTTPException(status_code=400, detail="Platform must be 'linkedin' or 'naukri'")


@app.get("/")
def root():
    return {"message": "Job Auto-Apply API is running 🚀"}


@app.post("/api/search-jobs")
def search_jobs(credentials: Credentials, config: SearchConfig):
    """Search for jobs on LinkedIn or Naukri and store them.
    Retries once automatically if Chrome crashes (GetHandleVerifier / empty message)."""
    from chrome_manager import kill_orphan_drivers

    def _run_search():
        if credentials.platform == "linkedin":
            return linkedin_login_and_search(credentials.email, credentials.password, config)
        elif credentials.platform == "naukri":
            return naukri_login_and_search(credentials.email, credentials.password, config)
        else:
            raise HTTPException(status_code=400, detail="Platform must be 'linkedin' or 'naukri'")

    try:
        logger.info(f"Searching {config.role} on {credentials.platform} for {credentials.email}")
        job_store.clear()

        def _is_chrome_crash(err: Exception) -> bool:
            s = str(err)
            return (
                not s.strip()
                or s.strip() == "Message:"
                or "GetHandleVerifier" in s
                or "Message: Stacktrace:" in s
                or "session not created" in s.lower()
                or "chrome not reachable" in s.lower()
                or "cannot connect to chrome" in s.lower()
                or "disconnected: not connected to devtools" in s.lower()
                or "failed to start" in s.lower()
            )

        MAX_ATTEMPTS = 3
        last_err: Exception | None = None
        jobs = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                jobs = _run_search()
                break
            except Exception as err:
                last_err = err
                if _is_chrome_crash(err) and attempt < MAX_ATTEMPTS:
                    wait = attempt * 5   # 5s, 10s between retries
                    logger.warning(
                        f"⚠️  Chrome crash on attempt {attempt}/{MAX_ATTEMPTS} "
                        f"— cleaning up and retrying in {wait}s..."
                    )
                    kill_orphan_drivers()
                    time.sleep(wait)
                else:
                    raise

        if jobs is None:
            raise last_err

        for j in jobs:
            job_store[j.id] = j

        logger.info(f"✅ Found {len(jobs)} jobs for '{config.role}'")

        if len(jobs) == 0:
            logger.warning("⚠️  No jobs found. This can happen for several reasons:")
            logger.warning("   1. LinkedIn/Naukri's anti-bot detection")
            logger.warning("   2. Jobs haven't loaded yet (try again)")
            logger.warning("   3. Search filters too restrictive")
            logger.warning("   4. Account too new or flagged")

        # Return only the freshly found jobs, not the whole accumulated store
        return {"success": True, "count": len(jobs), "jobs": jobs, "message": "Try Manual Apply if automation isn't working"}
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        logger.error(f"❌ Search failed: {error_msg}")
        
        # Provide more user-friendly error messages
        if "Security" in error_msg or "2FA" in error_msg or "verification" in error_msg.lower():
            detail = error_msg
        elif "login failed" in error_msg.lower():
            detail = error_msg
        elif "unusual activity" in error_msg.lower():
            detail = "LinkedIn blocked automation due to unusual activity. Log in manually first or try again in 24 hours."
        else:
            detail = f"Search failed: {error_msg}. Try: 1) Manual Apply instead, 2) Log in to {credentials.platform} manually first, 3) Disable 2FA, 4) Try Naukri instead"
        
        raise HTTPException(status_code=500, detail=detail)


@app.get("/api/jobs")
def get_jobs(platform: Optional[str] = None, status: Optional[str] = None):
    """Get all stored jobs with optional filters."""
    jobs = list(job_store.values())
    if platform:
        jobs = [j for j in jobs if j.platform == platform]
    if status:
        jobs = [j for j in jobs if j.status == status]
    return {"jobs": jobs, "total": len(jobs)}


@app.post("/api/apply/{job_id}")
def apply_single(job_id: str, req: ApplyWithJobRequest):
    """Auto-apply to a job. Job data is carried in the request body — no job_store lookup."""
    # Build a Job object from the request (works even after backend restart / store clear)
    job = job_store.get(job_id) or Job(
        id=job_id,
        title=req.title,
        company=req.company,
        location=req.location,
        experience=req.experience or "",
        salary=req.salary,
        posted="Recent",
        platform=req.platform,
        url=req.url,
        status="applying",
    )
    job.status = "applying"
    job_store[job_id] = job  # re-register so status updates are visible

    try:
        if req.platform == "linkedin":
            success = linkedin_easy_apply(job, req.email, req.password)
        else:
            success = naukri_apply(job, req.email, req.password)

        job.status = "applied" if success else "failed"
        db_save_application(
            job_id=job_id, title=job.title, company=job.company,
            location=job.location, platform=job.platform, url=job.url,
            status=job.status, method="auto",
            experience=job.experience, salary=job.salary,
        )
        return {"success": success, "job": job}
    except Exception as e:
        job.status = "failed"
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/mark-applied")
def mark_applied(req: MarkAppliedRequest):
    """Record a manually applied job into the database."""
    db_save_application(
        job_id=req.job_id, title=req.title, company=req.company,
        location=req.location, platform=req.platform, url=req.url,
        status="manually-applied", method="manual",
        experience=req.experience, salary=req.salary,
    )
    return {"success": True}


@app.post("/api/bulk-apply")
def bulk_apply(request: BulkApplyRequest, background_tasks: BackgroundTasks):
    """Search and auto-apply to all matching jobs in background."""
    background_tasks.add_task(
        run_bulk_apply,
        request.platform,
        request.credentials,
        request.config
    )
    return {
        "success": True,
        "message": f"Bulk apply started in background for '{request.config.role}' on {request.platform}"
    }


@app.get("/api/apply-log")
def get_apply_log():
    """Get full application history from database."""
    log = db_get_log()
    # Normalize field name so frontend's l.timestamp works
    for entry in log:
        entry["timestamp"] = entry.get("applied_at", "")
    return {"log": log, "total": len(log)}


@app.get("/api/stats")
def get_stats():
    """Stats from current session jobs + lifetime DB totals."""
    session_jobs = list(job_store.values())
    db = db_get_stats()
    return {
        # Session counts (current search)
        "total":    len(session_jobs),
        "pending":  sum(1 for j in session_jobs if j.status == "pending"),
        "applying": sum(1 for j in session_jobs if j.status == "applying"),
        "applied":  sum(1 for j in session_jobs if j.status in ("applied", "manually-applied")),
        "failed":   sum(1 for j in session_jobs if j.status == "failed"),
        # Lifetime DB totals
        "db_total":            db["total"],
        "db_applied":          db["applied"],
        "db_auto_applied":     db["auto_applied"],
        "db_manually_applied": db["manually_applied"],
        "db_failed":           db["failed"],
    }


@app.delete("/api/jobs")
def clear_jobs():
    """Clear all stored jobs."""
    job_store.clear()
    return {"success": True, "message": "All jobs cleared"}


# ──────────────────────────────────────────
# Run server
# ──────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("job_apply_backend:app", host="0.0.0.0", port=8001, reload=True)


# ──────────────────────────────────────────
# SETUP INSTRUCTIONS
# ──────────────────────────────────────────
"""
INSTALLATION:
    pip install fastapi uvicorn selenium webdriver-manager

REQUIREMENTS:
    - Google Chrome installed
    - Python 3.9+

RUN:
    python job_apply_backend.py
    OR
    uvicorn job_apply_backend:app --reload --port 8000

API DOCS (auto-generated):
    http://localhost:8000/docs

ENDPOINTS:
    POST /api/search-jobs     - Search and fetch jobs
    GET  /api/jobs            - List all jobs
    POST /api/apply/{job_id}  - Apply to single job
    POST /api/bulk-apply      - Auto-apply to all found jobs (background)
    GET  /api/apply-log       - View application history
    GET  /api/stats           - Dashboard stats
    DELETE /api/jobs          - Clear job list

NOTE:
    LinkedIn & Naukri may require CAPTCHA solving for first login.
    Use cookies/session persistence to avoid repeated logins.
    Respect each platform's Terms of Service.
"""
