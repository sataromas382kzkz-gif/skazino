// Смоук-тест плавной физической анимации шарика Плинко (public/app.js).
// Новая модель использует обычную физику падения:
//   - гравитация разгоняет шарик;
//   - колышки упруго отталкивают (жесткое столкновение, без проникновения);
//   - лёгкое "руление" ведёт шарик к слотам серверного bucket;
//   - шарик всегда приземляется в центр целевого слота и за разумное время.
// Этот файл просто запускает полный автономный тест новой физики
// (public/tests/plinko-physics.test.js), который дублирует чистую логику из
// initPlinko и проверяет инварианты на многих досках и семенах.
import { execFileSync } from 'node:child_process';

try {
  const output = execFileSync(process.execPath, ['public/tests/plinko-physics.test.js'], { encoding: 'utf8' });
  process.stdout.write(output);
  console.log('Анимация шарика Плинко: OK — обычное физическое падение без проникновений и резких скачков.');
  process.exitCode = 0;
} catch (error) {
  process.stdout.write(error.stdout || '');
  process.stderr.write(error.stderr || '');
  console.log(`Анимация шарика Плинко: ${error.status === 0 ? 'OK' : 'ошибок в тестах физики'}`);
  process.exitCode = error.status || 1;
}