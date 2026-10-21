"""Draws a synthetic US electric bill as a JPEG, laid out like a real one:
account summary box, meter readings, charge table, message box and a payment
stub. The utility, the name, the address and the figures are made up. No real
post. Needs Pillow."""
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1700, 2200
img = Image.new("RGB", (W, H), (255, 255, 255))
d = ImageDraw.Draw(img)

def font(size, bold=False):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
              "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"]:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()

NAVY = (20, 40, 90)
GREY = (90, 90, 90)
LINE = (170, 170, 170)
M = 90  # page margin

# ---- Header band -----------------------------------------------------------
d.rectangle((0, 0, W, 150), fill=NAVY)
d.text((M, 42), "NORTHBRIDGE ELECTRIC", font=font(52, True), fill=(255, 255, 255))
d.text((W - 560, 38), "ELECTRIC STATEMENT", font=font(30, True), fill=(255, 255, 255))
d.text((W - 560, 84), "Page 1 of 1", font=font(26), fill=(210, 215, 230))

y = 190
d.text((M, y), "Northbridge Electric  ·  PO Box 410  ·  Northbridge, OH 44001", font=font(26), fill=GREY)
d.text((M, y + 38), "northbridgeelectric.com  ·  Customer service (800) 048-7811", font=font(26), fill=GREY)

# ---- Customer / account block ---------------------------------------------
y = 300
d.text((M, y), "SERVICE FOR", font=font(24, True), fill=NAVY)
for i, line in enumerate(["Ms. E. Patel", "14 Orchard Lane", "Northbridge, OH 44002"]):
    d.text((M, y + 40 + i * 42), line, font=font(32), fill=(0, 0, 0))

bx = W // 2 + 30
d.rectangle((bx, y - 8, W - M, y + 230), outline=NAVY, width=3)
rows = [("Account number", "4471 0392 11"),
        ("Statement date", "October 12, 2026"),
        ("Billing period", "Sep 1 – Sep 30, 2026"),
        ("Rate schedule", "Residential R-1")]
for i, (k, v) in enumerate(rows):
    ry = y + 12 + i * 52
    d.text((bx + 28, ry), k, font=font(27), fill=GREY)
    d.text((W - M - 28, ry), v, font=font(29, True), fill=(0, 0, 0), anchor="ra")

# ---- Amount due banner -----------------------------------------------------
y = 590
d.rectangle((M, y, W - M, y + 110), fill=(238, 241, 248), outline=NAVY, width=3)
d.text((M + 30, y + 30), "TOTAL AMOUNT DUE", font=font(34, True), fill=NAVY)
d.text((W // 2 - 60, y + 30), "DUE DATE  October 28, 2026", font=font(32, True), fill=(0, 0, 0))
d.text((W - M - 30, y + 22), "$92.58", font=font(52, True), fill=(0, 0, 0), anchor="ra")

# ---- Meter readings --------------------------------------------------------
y = 770
d.text((M, y), "METER READINGS", font=font(28, True), fill=NAVY)
y += 48
head = ["Meter", "Previous (Sep 1)", "Present (Sep 30)", "Usage"]
vals = ["E-88412", "41,382 kWh", "41,816 kWh", "434 kWh"]
cols = [M, 520, 940, 1360]
for x, t in zip(cols, head):
    d.text((x, y), t, font=font(26, True), fill=GREY)
d.line((M, y + 42, W - M, y + 42), fill=LINE, width=2)
for x, t in zip(cols, vals):
    d.text((x, y + 56), t, font=font(30), fill=(0, 0, 0))

# ---- Charges table ---------------------------------------------------------
y = 960
d.text((M, y), "CURRENT CHARGES", font=font(28, True), fill=NAVY)
y += 52
charges = [
    ("Basic service charge", "", "$8.50"),
    ("Energy charge", "434 kWh × $0.12143", "$52.70"),
    ("Delivery charge", "434 kWh × $0.05599", "$24.30"),
    ("State sales tax", "", "$4.28"),
    ("County utility tax", "", "$2.80"),
]
for label, detail, amount in charges:
    d.text((M, y), label, font=font(31), fill=(0, 0, 0))
    if detail:
        d.text((700, y + 3), detail, font=font(27), fill=GREY)
    d.text((W - M, y), amount, font=font(31), fill=(0, 0, 0), anchor="ra")
    d.line((M, y + 48, W - M, y + 48), fill=(225, 225, 225), width=2)
    y += 62
d.line((M, y + 2, W - M, y + 2), fill=(0, 0, 0), width=3)
y += 18
d.text((M, y), "Total current charges", font=font(33, True), fill=(0, 0, 0))
d.text((W - M, y), "$92.58", font=font(33, True), fill=(0, 0, 0), anchor="ra")

# ---- Usage comparison ------------------------------------------------------
y += 90
d.text((M, y), "YOUR USAGE", font=font(28, True), fill=NAVY)
y += 46
for k, v in [("This month", "434 kWh"), ("Same month last year", "472 kWh"), ("Average daily use", "14.5 kWh")]:
    d.text((M, y), k, font=font(29), fill=GREY)
    d.text((620, y), v, font=font(29), fill=(0, 0, 0))
    y += 44

# ---- Message box -----------------------------------------------------------
y += 24
d.rectangle((M, y, W - M, y + 130), outline=LINE, width=2)
d.text((M + 26, y + 18), "Finding it hard to pay?  Call us at (800) 048-7811, Monday to Friday, 8 am to 6 pm.",
       font=font(28), fill=(0, 0, 0))
d.text((M + 26, y + 64), "We can spread your balance over smaller monthly payments at no extra cost.",
       font=font(28), fill=(0, 0, 0))

# ---- Payment stub ----------------------------------------------------------
y += 180
d.line((M, y, W - M, y), fill=(0, 0, 0), width=1)
for x in range(M, W - M, 34):
    d.line((x, y, x + 16, y), fill=(255, 255, 255), width=1)  # perforation
d.text((W // 2, y + 14), "Please detach and return this stub with your payment", font=font(23), fill=GREY, anchor="ma")
y += 70
d.text((M, y), "PAYMENT STUB", font=font(26, True), fill=NAVY)
stub = [("Account number", "4471 0392 11"), ("Due date", "October 28, 2026"), ("Amount due", "$92.58"), ("Amount enclosed", "$ ________")]
for i, (k, v) in enumerate(stub):
    sy = y + 48 + i * 46
    d.text((M, sy), k, font=font(28), fill=GREY)
    d.text((560, sy), v, font=font(30, True if "due" in k else False), fill=(0, 0, 0))
d.text((W - M, y + 48), "Make checks payable to:", font=font(26), fill=GREY, anchor="ra")
d.text((W - M, y + 88), "Northbridge Electric", font=font(29, True), fill=(0, 0, 0), anchor="ra")
d.text((W - M, y + 128), "PO Box 410, Northbridge, OH 44001", font=font(26), fill=(0, 0, 0), anchor="ra")

img.save(sys.argv[1], "JPEG", quality=88)
print("wrote", sys.argv[1], img.size)
