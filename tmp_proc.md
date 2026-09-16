const fs = require('fs');
const root = 'C:/Users/katwa/OneDrive/Documents/HMS';
const NL = String.fromCharCode(10);
const rd = (p) => fs.readFileSync(root + '/' + p, 'utf8');

// 1. service: createPurchaseOrder items.create block 500-545 + subtotal/tax recalc behavior
console.log('=== service: createPurchaseOrder items.create + totals (500..545) ===');
const svc = rd('apps/server/src/modules/procurement/procurement.service.ts').split(/\r?\n/);
for (let i = 499; i < 545; i++) console.log(String(i + 1).padStart(4) + '|' + svc[i]);

// 2. service signature + revision default handling on create
console.log('');
console.log('=== service: createPurchaseOrder signature + revision set ===');
for (let i = 451; i < 500; i++) if (/async createPurchaseOrder|revision|subtotal|taxableAmount|\borg:|productCategory/.test(svc[i])) console.log(String(i + 1).padStart(4) + '|' + svc[i]);

// 3. DTOs for procurement
console.log('');
console.log('=== procurement dto files ===');
const fs2 = require('fs'), ps = require('path');
const dir = 'apps/server/src/modules/procurement';
for (const f of fs2.readdirSync(root + '/' + dir)) if (/dto/i.test(f)) console.log('  ' + f(end));

// 4. read the PO dto file fully
const dtoPath = root + '/apps/server/src/modules/procurement/procurement.dto.ts';
if (fs.existsSync(dtoPath)) {
  console.log('');
  console.log('=== procurement.dto.ts ===');
  const dto = rd('apps/server/src/modules/procurement/procurement.dto.ts').split(/\r?\n/);
  for (let i = 0; i < dto.length; i++) console.log(String(i + 1).padStart(4) + '|' + dto[i]);
} else {
  console.log('NO procurement.dto.ts — DTOs likely inline in controller imports');
}
