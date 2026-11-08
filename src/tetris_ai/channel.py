"""Read-only TETRA CHANNEL public API client; no game API usage."""
import json
import time
from urllib.request import Request, urlopen

BASE='https://ch.tetr.io/api/'

def fetch_public_stats():
    request=Request(BASE+'general/stats',headers={'User-Agent':'TetrisAIResearch/0.1 (educational read-only)'})
    with urlopen(request,timeout=12) as response:
        return json.load(response)
