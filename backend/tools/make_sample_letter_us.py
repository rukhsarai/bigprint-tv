"""Draws a synthetic US electric bill as a JPEG, for the demo video and
backend/tools/round_trip.sh. No real post: the utility, the name, the
address and the figures are made up. Needs Pillow."""
import sys

from PIL import Image, ImageDraw, ImageFont
W, H = 1600, 2200
img = Image.new("RGB", (W, H), (248, 246, 240))
d = ImageDraw.Draw(img)
def font(size, bold=False):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
              "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"]:
        try: return ImageFont.truetype(p, size)
        except Exception: pass
    return ImageFont.load_default()
y = 120
d.text((120, y), "Northbridge Electric", font=font(64, True), fill=(20, 40, 90)); y += 90
d.text((120, y), "Customer Service, PO Box 410, Northbridge, OH 44001", font=font(30), fill=(60,60,60)); y += 110
d.text((120, y), "Ms. E. Patel", font=font(36), fill=(0,0,0)); y += 50
d.text((120, y), "14 Orchard Lane", font=font(36), fill=(0,0,0)); y += 50
d.text((120, y), "Northbridge, OH 44002", font=font(36), fill=(0,0,0)); y += 90
d.text((120, y), "Account number: 4471 0392 11", font=font(36), fill=(0,0,0)); y += 50
d.text((120, y), "Bill date: October 12, 2026", font=font(36), fill=(0,0,0)); y += 100
d.text((120, y), "Your electric bill", font=font(56, True), fill=(0,0,0)); y += 100
rows = [("Electricity used (September)", "$61.20"), ("Delivery charge", "$24.30"), ("Taxes and fees", "$7.08"), ("Total amount due", "$92.58")]
for label, val in rows:
    d.text((120, y), label, font=font(38), fill=(0,0,0))
    d.text((1150, y), val, font=font(38, True if "Total" in label else False), fill=(0,0,0))
    d.line((120, y+58, 1480, y+58), fill=(180,180,180), width=2)
    y += 80
y += 60
d.text((120, y), "Please pay by October 28, 2026.", font=font(42, True), fill=(0,0,0)); y += 80
for line in ["You can pay by automatic payment, online at northbridgeelectric.com,",
             "or by phone at (800) 048-7811, Monday to Friday, 8 am to 6 pm.",
             "", "If you are finding it hard to pay, please call us. We can spread",
             "the amount over smaller monthly payments at no extra cost.",
             "", "Thank you for being a customer.", "", "Northbridge Electric"]:
    d.text((120, y), line, font=font(34), fill=(30,30,30)); y += 52
img.save(sys.argv[1], "JPEG", quality=85)
print("wrote", sys.argv[1], img.size)
