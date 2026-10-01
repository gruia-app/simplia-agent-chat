import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = { width: 1280, height: 900 };
const mobile390 = { width: 390, height: 844 };
const qaNames = [
  'desktop: sin desbordamiento horizontal',
  'desktop: aceptar aplica la versión modificada a la vista',
  'desktop: deshacer restaura el valor',
  'desktop: confirmar bloqueado hasta marcar la casilla',
  'desktop: el foco entra en el diálogo',
  'desktop: el foco no sale del diálogo con Tab',
  'desktop: la memoria incorpora lo aprendido',
  'desktop: la clave no queda visible tras conectar',
  'desktop: todos los botones visibles tienen nombre',
  'desktop: objetivos táctiles >= 32px',
  'desktop: sin errores JS',
  'mobile390: sin desbordamiento horizontal',
  'mobile390: aceptar aplica la versión modificada a la vista',
  'mobile390: deshacer restaura el valor',
  'mobile390: confirmar bloqueado hasta marcar la casilla',
  'mobile390: el foco entra en el diálogo',
  'mobile390: el foco no sale del diálogo con Tab',
  'mobile390: la memoria incorpora lo aprendido',
  'mobile390: la clave no queda visible tras conectar',
  'mobile390: todos los botones visibles tienen nombre',
  'mobile390: objetivos táctiles >= 32px',
  'mobile390: sin errores JS',
];
const fixturePath = fileURLToPath(new URL('../../../fixtures/qa-M/qa-resultados.json', import.meta.url));

test.beforeAll(async () => {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as Array<{ n: string }>;
  expect(qaNames).toEqual(fixture.map(check => check.n));
});

const baseURL = process.env.CHAT_DEMO_URL ?? 'http://127.0.0.1:4173';
const distRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const action = {
  edit: 'Mejora el asunto del primer email; que suene menos a venta',
  addStep: 'Añade un tercer paso de cierre a los 7 días',
  launch: 'Lánzala a los 12 leads',
  remember: 'La abuela se llama Carmen, no Rosa',
};

async function openDemo(page: Page, viewport: typeof desktop | typeof mobile390) {
  await page.setViewportSize(viewport);
  await page.route(`${baseURL}/**`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
    const target = resolve(distRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(distRoot)) return route.fulfill({ status: 400, body: 'Bad path' });
    try {
      const body = await readFile(target);
      const contentType = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' } as Record<string, string>)[extname(target)] ?? 'application/octet-stream';
      await route.fulfill({ status: 200, body, contentType });
    } catch {
      await route.fulfill({ status: 404, body: `Missing demo asset: ${pathname}` });
    }
  });
  await page.goto(baseURL);
  await expect(page.locator('#composer .sac-composer-input')).toBeVisible();
}

async function send(page: Page, message: string) {
  const existingProposals = await page.locator('.sac-f1-card').count();
  await page.locator('#composer .sac-composer-input').fill(message);
  await page.locator('#composer button[type="submit"]').click();
  await expect(page.locator('.sac-f1-card')).toHaveCount(existingProposals + 1);
  await expect(page.locator('.sac-f1-card').last()).toBeVisible();
}

function activeProposal(page: Page) {
  return page.locator('.sac-f1-card').filter({ has: page.getByRole('button', { name: 'Aceptar' }) }).last();
}

function activeProposalWrap(page: Page) {
  return page.locator('.proposal-wrap').filter({ has: page.getByRole('button', { name: 'Aceptar' }) }).last();
}

async function accept(page: Page) {
  const card = activeProposal(page);
  await card.getByRole('button', { name: 'Aceptar' }).click();
  await expect(card.getByRole('button', { name: 'Aceptar' })).toHaveCount(0);
}

async function launchDialog(page: Page) {
  await send(page, action.edit);
  await accept(page);
  await send(page, action.addStep);
  await accept(page);
  await send(page, action.launch);
  await activeProposal(page).getByRole('button', { name: 'Aceptar' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
}

for (const viewport of [desktop, mobile390]) {
  const prefix = viewport === desktop ? 'desktop:' : 'mobile390:';

  test(qaNames[viewport === desktop ? 0 : 11], async ({ page }) => {
    await openDemo(page, viewport);
    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(widths.content - widths.viewport).toBe(0);
  });

  test(qaNames[viewport === desktop ? 1 : 12], async ({ page }) => {
    await openDemo(page, viewport);
    await send(page, action.edit);
    const wrap = activeProposalWrap(page);
    const card = wrap.locator('.sac-f1-card');
    await card.getByRole('button', { name: 'Modificar' }).click();
    const changed = '¿Cómo vais a absorber el pico de noviembre sin contratar?';
    await wrap.getByRole('textbox', { name: 'Modificar propuesta' }).fill(changed);
    await wrap.getByRole('button', { name: 'Guardar cambio' }).click();
    await expect(page.locator('.sac-f1-card').last()).toContainText(changed);
    await activeProposal(page).getByRole('button', { name: 'Aceptar' }).click();
    await expect(page.locator('#viewsec')).toContainText(changed);
  });

  test(qaNames[viewport === desktop ? 2 : 13], async ({ page }) => {
    await openDemo(page, viewport);
    await send(page, action.edit);
    await accept(page);
    await expect(page.locator('#viewsec')).toContainText('¿Cómo vais a absorber el pico de noviembre?');
    await page.getByRole('status').filter({ has: page.getByRole('button', { name: 'Deshacer' }) }).getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.locator('#viewsec')).toContainText('Una pregunta sobre vuestros envíos de noviembre');
  });

  test(qaNames[viewport === desktop ? 3 : 14], async ({ page }) => {
    await openDemo(page, viewport);
    await launchDialog(page);
    const dialog = page.getByRole('alertdialog');
    const ack = dialog.getByRole('checkbox');
    const confirm = dialog.getByRole('button', { name: 'Enviar ahora' });
    await expect(confirm).toBeDisabled();
    await ack.check();
    await expect(confirm).toBeEnabled();
  });

  test(qaNames[viewport === desktop ? 4 : 15], async ({ page }) => {
    await openDemo(page, viewport);
    await launchDialog(page);
    await expect(page.getByRole('alertdialog').getByRole('checkbox')).toBeFocused();
  });

  test(qaNames[viewport === desktop ? 5 : 16], async ({ page }) => {
    await openDemo(page, viewport);
    await launchDialog(page);
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: 'Cancelar' }).focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('checkbox')).toBeFocused();
  });

  test(qaNames[viewport === desktop ? 6 : 17], async ({ page }) => {
    await openDemo(page, viewport);
    await page.locator('#appsel').selectOption('famitale');
    await send(page, action.remember);
    await accept(page);
    await page.locator('#membtn').click();
    await expect(page.locator('#memdlg')).toContainText('Carmen');
  });

  test(qaNames[viewport === desktop ? 7 : 18], async ({ page }) => {
    await openDemo(page, viewport);
    await page.locator('#planbtn').click();
    const key = 'sk-ant-test-only-not-a-real-key';
    await page.locator('#apikey').fill(key);
    await page.locator('#apikey-save').click();
    await expect(page.locator('#apikey')).toHaveValue('');
    await expect(page.locator('#apikey-state')).not.toContainText(key);
    await expect(page.locator('#byo')).not.toContainText(key);
  });

  test(qaNames[viewport === desktop ? 8 : 19], async ({ page }) => {
    await openDemo(page, viewport);
    const unnamed = await page.locator('button:visible').evaluateAll(buttons =>
      buttons.filter(button => {
        const el = button as HTMLButtonElement;
        const name = el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText;
        return !name.trim();
      }).length,
    );
    expect(unnamed).toBe(0);
  });

  test(qaNames[viewport === desktop ? 9 : 20], async ({ page }) => {
    await openDemo(page, viewport);
    const minimum = viewport === mobile390 ? 44 : 32;
    const tooSmall = await page.locator('button:visible').evaluateAll(
      (buttons, threshold) => buttons.filter(button => {
        const rect = button.getBoundingClientRect();
        return rect.width < threshold || rect.height < threshold;
      }).length,
      minimum,
    );
    expect(tooSmall).toBe(0);
  });

  test(qaNames[viewport === desktop ? 10 : 21], async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await openDemo(page, viewport);
    await send(page, action.edit);
    await accept(page);
    expect(errors).toEqual([]);
  });

  test(`${prefix} axe sin violaciones`, async ({ page }) => {
    await openDemo(page, viewport);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}

test('famitale: apply con coste recalculado al alza no consume créditos', async ({ page }) => {
  await openDemo(page, desktop);
  await page.locator('#appsel').selectOption('famitale');
  await send(page, action.remember);
  await accept(page);
  await send(page, 'Haz la página 3 más tranquila, es para dormir');
  await accept(page);
  await send(page, 'Genera las ilustraciones');
  await page.getByRole('checkbox', { name: 'Simular subida de coste en apply' }).check();
  await activeProposal(page).getByRole('button', { name: 'Aceptar' }).click();
  await expect(page.getByRole('alert')).toContainText('El coste ha subido');
  await expect(page.locator('#viewsec')).toContainText('24');
});

test('insaidr: cancelar durante la gracia conserva el borrador sin enviar', async ({ page }) => {
  await openDemo(page, desktop);
  await launchDialog(page);
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Enviar ahora' }).click();
  const wrap = page.locator('.proposal-wrap').last();
  await expect(wrap.getByRole('button', { name: 'Cancelar envío' })).toBeVisible();
  await wrap.getByRole('button', { name: 'Cancelar envío' }).click();
  await expect(page.locator('#log')).toContainText('Envío cancelado durante la gracia; no se envió nada.');
  await expect(page.locator('#viewsec')).toContainText('Borrador');
});
