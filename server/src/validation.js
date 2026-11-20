// Серверна валідація даних форми замовлення та запитання до AI-консультанта.
export const DELIVERY = ['nova_poshta', 'ukrposhta', 'pickup'];
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/; // VIN: 17 символів, без літер I, O, Q

const str = (v) => (typeof v === 'string' ? v.trim() : '');

export function validateOrder(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { valid: false, errors: { form: 'Очікується об’єкт JSON.' } };
  }
  const errors = {};
  const name = str(payload.name);
  const phone = str(payload.phone);
  const city = str(payload.city);
  const delivery = str(payload.delivery);
  const vin = str(payload.vin).toUpperCase();
  const comment = str(payload.comment);
  const productId = Number(payload.productId);
  const quantity = Number(payload.quantity);

  if (name.length < 2 || name.length > 80 || !/^[\p{L}\p{M}'’\- .]+$/u.test(name)) {
    errors.name = 'Ім’я: 2–80 символів, лише літери, пробіл, апостроф або дефіс.';
  }
  if (!/^\+?[0-9 ()-]{9,20}$/.test(phone) || phone.replace(/\D/g, '').length < 10) {
    errors.phone = 'Вкажіть коректний телефон (мінімум 10 цифр), напр. +380991234567.';
  }
  if (!Number.isSafeInteger(productId) || productId < 1) {
    errors.productId = 'Оберіть товар зі списку.';
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    errors.quantity = 'Кількість від 1 до 20 шт.';
  }
  if (city.length < 2 || city.length > 60) {
    errors.city = 'Вкажіть місто доставки (2–60 символів).';
  }
  if (!DELIVERY.includes(delivery)) {
    errors.delivery = 'Оберіть спосіб доставки.';
  }
  if (vin && !VIN_RE.test(vin)) {
    errors.vin = 'VIN-код має містити 17 символів (латинські літери без I, O, Q та цифри).';
  }
  if (comment.length > 500) {
    errors.comment = 'Коментар не довше 500 символів.';
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: { name, phone, city, delivery, vin, comment, productId, quantity }
  };
}

export function validateAiQuestion(payload) {
  const question = str(payload?.question);
  if (question.length < 3 || question.length > 500) {
    return { valid: false, error: 'Запитання має містити від 3 до 500 символів.' };
  }
  return { valid: true, question };
}
