-- Демонстраційний каталог AutoPulse (8 товарів, 4 категорії). Ціни умовні.
INSERT INTO products (slug, title, brand, category, description, price_uah, stock, image_key, position) VALUES
('castrol-edge-5w30', 'Моторна олива EDGE 5W-30, 4 л', 'Castrol', 'Оливи', 'Синтетична олива для бензинових і дизельних двигунів, допуск VW 504/507.', 1650, 24, 'oil', 1),
('liqui-moly-75w90', 'Трансмісійна олива 75W-90, 1 л', 'Liqui Moly', 'Оливи', 'Для механічних коробок передач і редукторів.', 720, 15, 'oil', 2),
('mann-w712-75', 'Масляний фільтр W 712/75', 'MANN-FILTER', 'Фільтри', 'Підходить для VW, Skoda, Audi, Seat з бензиновими двигунами.', 320, 40, 'filter', 3),
('bosch-air-f026', 'Повітряний фільтр F 026 400 287', 'Bosch', 'Фільтри', 'Фільтр очищення повітря двигуна, ресурс до 30 000 км.', 410, 32, 'filter', 4),
('brembo-p85020', 'Гальмівні колодки передні P 85 020', 'Brembo', 'Гальма', 'Комплект передніх колодок з низьким рівнем шуму.', 1890, 10, 'brake', 5),
('ate-dot4', 'Гальмівна рідина DOT 4, 1 л', 'ATE', 'Гальма', 'Температура кипіння 260 °C, заміна кожні 2 роки.', 380, 50, 'brake', 6),
('varta-e11', 'Акумулятор Blue Dynamic 74 Ah', 'Varta', 'Електрика', 'Пусковий струм 680 A, полярність «+» праворуч.', 4250, 6, 'battery', 7),
('philips-h7', 'Лампа H7 X-tremeVision Pro150', 'Philips', 'Електрика', 'Галогенна лампа головного світла, комплект 2 шт.', 690, 60, 'lamp', 8)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, brand = EXCLUDED.brand, category = EXCLUDED.category,
  description = EXCLUDED.description, price_uah = EXCLUDED.price_uah,
  image_key = EXCLUDED.image_key, position = EXCLUDED.position;
