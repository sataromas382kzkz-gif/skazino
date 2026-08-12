const fs = require('fs');
const s = fs.readFileSync('public/app.js', 'utf8');
const i = s.indexOf('function applyBallPhysics');
console.log('index', i);
console.log(s.slice(i - 60, i + 2200));
