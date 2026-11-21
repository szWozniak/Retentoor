import httpx

# One shared client config for all external data sources.
TIMEOUT = httpx.Timeout(25.0, connect=10.0)
HEADERS = {"User-Agent": "hacknation-kowr-prototype/0.1"}


def client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS, follow_redirects=True)
