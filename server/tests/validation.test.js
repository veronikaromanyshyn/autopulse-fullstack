import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder, validateAiQuestion } from '../src/validation.js';

const good = {
  name: 'Іван Петренко', phone: '+380991234567', productId: 1, quantity: 2,
  city: 'Івано-Франківськ', delivery: 'nova_poshta', vin: '', comment: ''
};

test('коректне замовлення проходить перевірку', () => {
  assert.equal(validateOrder(good).valid, true);
});
test('короткий телефон відхиляється', () => {
  const r = validateOrder({ ...good, phone: '123' });
  assert.equal(r.valid, false);
  assert.ok(r.errors.phone);
});
test('кількість поза межами 1–20 відхиляється', () => {
  assert.ok(validateOrder({ ...good, quantity: 0 }).errors.quantity);
  assert.ok(validateOrder({ ...good, quantity: 25 }).errors.quantity);
});
test('невідомий спосіб доставки відхиляється', () => {
  assert.ok(validateOrder({ ...good, delivery: 'drone' }).errors.delivery);
});
test('некоректний VIN відхиляється, коректний приймається', () => {
  assert.ok(validateOrder({ ...good, vin: 'ABC123' }).errors.vin);
  assert.equal(validateOrder({ ...good, vin: 'WVWZZZ1KZAW123456' }).valid, true);
});
test('ім’я з цифрами відхиляється', () => {
  assert.ok(validateOrder({ ...good, name: 'Ivan123' }).errors.name);
});
test('запитання до AI: занадто коротке відхиляється', () => {
  assert.equal(validateAiQuestion({ question: 'ок' }).valid, false);
});
test('запитання до AI: коректне приймається', () => {
  assert.equal(validateAiQuestion({ question: 'Яку оливу обрати для Skoda Octavia?' }).valid, true);
});
