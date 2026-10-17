import re
src = open("client.js", encoding="utf-8").read()
i = src.find("for (const [key, scrim] of Object.entries(OPACITY_SCRIMS))")
print(src[i:i+700] if i>0 else "NOT FOUND")
