// server.js
// הפעלת הקוד של הבוט (נניח שהקוד של הבוט נמצא בקובץ index.js)
require('./aa.js');

const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// הגדרת נתיב לתיקייה בה נמצאים הקבצים הסטטיים (כולל status.html)
app.use(express.static(__dirname));

// כאשר ניגשים לנתיב '/', נשלח את קובץ ה-status.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'status.html'));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
