# Sample bills

Synthetic documents; the names, addresses and figures are made up. These are
the exact pages used to build, test and film BigPrint TV, so what a judge
sees on the TV can be checked against what is printed here.

| File | Used for | Key facts the TV should show |
|---|---|---|
| `us-bill.jpg` | The demo video and the Devpost screenshots: a one-page electric statement with a meter table, five charge lines and a payment stub | Amount due **$92.58**, due date **October 28, 2026**, statement date October 12, 2026, account **4471 0392 11**, phone (800) 048-7811, usage 434 kWh |
| `us-bill-blurry.jpg` | The "Check: some words were hard to read" panel in the video | Same page, deliberately out of focus |
| `us-bill-very-blurry.jpg` | The figure the TV refuses to state: blurred far enough that Textract's reading of a money figure falls below the confidence floor | Same page, much worse. The TV shows the Check panel, pins only the figures it is sure of, and prints **[hard to read — check the paper]** where the untrusted figure stood |
| `uk-water-bill.jpg` | `backend/tools/round_trip.sh`, the live end-to-end test (5 of 5 key facts right on 19 October) | Amount due **£92.58**, pay by **28 October 2026**, account **4471 0392 11**, phone 0800 048 7811 |

`us-bill-very-blurry.jpg` is `us-bill-blurry.jpg` put through a Gaussian blur
and a little noise, which is what it takes to push a printed total below the
floor; the figures on the page are unchanged.

`uk-water-bill.jpg` is drawn by `backend/tools/make_sample_letter.py` and
`us-bill.jpg` by `make_sample_letter_us.py`; the figures are identical on
purpose, so the currency guard can be seen choosing dollars on one and pounds
on the other.
