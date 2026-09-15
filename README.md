# ניאון רייסר / Neon Racer

משחק מירוץ דו-ממדי מלמעלה בדפדפן: שלוש הקפות במסלול לילי מול שלוש מכוניות יריבות, שעון הקפות ושיא מקומי.

A top-down 2D browser racing mini-game: three laps on a neon night circuit against three AI cars, with a lap timer and a local best time.

## הרצה / How to run

אין שלב בנייה. פשוט פתחו את הקובץ:

No build step. Open this file in a browser:

```text
index.html
```

אפשר גם לשרת מקומית (נוח למובייל ברשת הביתית):

```bash
python3 -m http.server 8080
```

ואז לגשת אל `http://localhost:8080`.

GitHub Pages: הגדירו את שורש האתר לתיקיית הריפו — `index.html` נמצא בשורש.

## שליטה / Controls

| פעולה / Action | מקלדת / Keyboard | מסך / Touch |
| --- | --- | --- |
| האצה / Accelerate | `↑` או `W` | כפתור ▲ (נשאר דולק עד בלם) |
| בלם / Brake | `↓`, `S` או `Space` | כפתור ▬ |
| הגה / Steer | `←` `→` או `A` `D` | ◀ ▶ |
| השתקה / Mute | `M` | כפתור ♪ |
| שחק שוב / Restart | `R` או `Enter` (אחרי סיום) | כפתורי המסך |

## משחק / Gameplay

- **3 הקפות** מול **3 מכוניות AI** (רייזר, וולט, ניקס). הרכב נוסע קדימה גם בלי להחזיק גז; W / ▲ להאצה מלאה.
- יציאה מהכביש לדשא מאטה את הרכב; פגיעה בקיר מחזירה למסלול ומורידה מהירות.
- הזמן הכולל נשמר ב־`localStorage` אם שברתם שיא.
- ממשק דו-לשוני עברית / English (כפתור `EN` / `עב`).

## מבנה / Files

```text
index.html     דף המשחק
css/style.css  עיצוב מסכים, HUD וכפתורי מגע
js/game.js     מסלול, פיזיקה, AI, שמע ולולאת המשחק
```

השמע נוצר ב־Web Audio API (אין קבצי אודיו חיצוניים). אפשר להשתיק בכל רגע.

## רישיון

משחק דמו פתוח בריפו זה — שחקו, שנו, שפרו.
