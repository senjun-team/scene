USERS_WHITELIST = (
    # Team
    "anya-501d0a23",
    "dima-568841ae",
    "vova-d88c8b16",
    "olya-0833d031",
    # Alpha testers
    "sasha-666e9132",
    "misha-63d9349c",
    "rostik-51518ea5",
    "dima-355a472d",
    "pasha-f758c35d", # Anya's contact
    # New testers after 1st wave of fixes (unlocking chapters, etc)
    "sergey-d0382d2b", # ex mapsme
    "pasha-fba97bb2", # Dima's contact
    "max-3f5368da", # Dima's contact
    "pasha-1e969886", # Vova's contact
    "kirill-5e4a164", # Dima's contact
    "volodya-9bcbe8c", # navi/rendering
    "tanya-769a163" # ex mapsme
)


def user_in_whitelist(user_login):
    return user_login in USERS_WHITELIST
