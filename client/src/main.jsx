import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// Єдина функція для звернень до REST API
async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.details = data.details || {};
    throw error;
  }
  return data;
}

const DELIVERY_LABELS = { nova_poshta: 'Нова Пошта', ukrposhta: 'Укрпошта', pickup: 'Самовивіз' };
const blankOrder = { productId: '', quantity: 1, name: '', phone: '+380', city: '', delivery: 'nova_poshta', vin: '', comment: '' };
const CATEGORY_KEY = 'autopulse.category';

function ProductIcon({ type }) {
  const icons = {
    oil: <><path d="M60 70h70l20 20v70a10 10 0 0 1-10 10H60a10 10 0 0 1-10-10V80a10 10 0 0 1 10-10Z"/><path d="M75 70V52h40v18M150 95l25-15M70 120h60M70 140h40"/></>,
    filter: <><ellipse cx="110" cy="60" rx="50" ry="14"/><path d="M60 60v90c0 8 22 14 50 14s50-6 50-14V60"/><path d="M75 72v80M90 74v84M105 75v86M120 75v86M135 74v84M150 72v80"/></>,
    brake: <><circle cx="110" cy="105" r="62"/><circle cx="110" cy="105" r="18"/><path d="M60 70a62 62 0 0 1 40-26l-6 30a32 32 0 0 0-20 14Z"/><circle cx="110" cy="68" r="5"/><circle cx="146" cy="105" r="5"/><circle cx="110" cy="142" r="5"/><circle cx="74" cy="105" r="5"/></>,
    battery: <><rect x="45" y="65" width="130" height="90" rx="8"/><path d="M65 65V52h22v13M133 65V52h22v13M68 105h18M77 96v18M134 105h18"/></>,
    lamp: <><path d="M85 60a40 40 0 1 1 50 0c-8 7-10 15-10 25h-30c0-10-2-18-10-25Z"/><path d="M95 95h30M97 108h26M102 121h16M110 30v-12M150 45l9-9M70 45l-9-9"/></>
  };
  return <svg viewBox="0 0 220 190" aria-hidden="true">{icons[type] || icons.oil}</svg>;
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // ЛР4: у localStorage зберігається лише несекретне налаштування – вибрана категорія
  const [category, setCategory] = useState(() => {
    try { return localStorage.getItem(CATEGORY_KEY) || 'Усі'; } catch { return 'Усі'; }
  });
  const [form, setForm] = useState(blankOrder);
  const [errors, setErrors] = useState({});
  const [formMessage, setFormMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState([]);
  const [visits, setVisits] = useState(null);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState([]);
  const [asking, setAsking] = useState(false);
  const chatEnd = useRef(null);

  const loadMine = () => request('/api/orders/mine').then(d => setMine(d.orders)).catch(() => {});

  useEffect(() => {
    request('/api/products')
      .then(({ products }) => setProducts(products))
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
    request('/api/session').then(d => setVisits(d.visits)).catch(() => {});
    loadMine();
  }, []);

  useEffect(() => {
    try { localStorage.setItem(CATEGORY_KEY, category); } catch { /* сховище вимкнене */ }
  }, [category]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [chat, asking]);

  const categories = useMemo(() => ['Усі', ...new Set(products.map(p => p.category))], [products]);
  const visible = useMemo(
    () => products.filter(p => category === 'Усі' || p.category === category),
    [products, category]);
  const selected = products.find(p => String(p.id) === String(form.productId));
  const total = selected ? selected.price_uah * Number(form.quantity || 0) : 0;

  const setField = (name, value) => {
    setForm(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: undefined }));
    setFormMessage(null);
  };

  const chooseProduct = (id) => {
    setField('productId', String(id));
    document.getElementById('order')?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendOrder = async (e) => {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;   // клієнтська HTML-валідація
    setSubmitting(true);
    setFormMessage(null);
    try {
      const data = await request('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ ...form, productId: Number(form.productId), quantity: Number(form.quantity) })
      });
      setFormMessage({ type: 'success', text: `${data.message} Номер замовлення: ${data.reference}. Сума: ${data.total_uah} грн.` });
      setForm(blankOrder);
      setErrors({});
      loadMine();
      request('/api/products').then(({ products }) => setProducts(products)).catch(() => {});
    } catch (err) {
      setErrors(err.details);
      setFormMessage({ type: 'error', text: Object.values(err.details).join(' ') || err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const ask = async (e) => {
    e.preventDefault();
    const text = question.trim();
    if (text.length < 3 || asking) return;
    setChat(prev => [...prev, { role: 'user', text }]);
    setQuestion('');
    setAsking(true);
    try {
      const { answer } = await request('/api/ai/consult', { method: 'POST', body: JSON.stringify({ question: text }) });
      setChat(prev => [...prev, { role: 'bot', text: answer }]);
    } catch (err) {
      setChat(prev => [...prev, { role: 'bot', text: `⚠ ${err.message}`, error: true }]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <a href="#top" className="logo"><span className="logo-mark">⚡</span>Auto<b>Pulse</b></a>
          <button className="menu-toggle" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          <nav className={menuOpen ? 'nav open' : 'nav'} onClick={() => setMenuOpen(false)}>
            <a href="#catalog">Каталог</a>
            <a href="#how">Як замовити</a>
            <a href="#order">Замовлення</a>
            <a href="#assistant">AI-консультант</a>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <p className="eyebrow">ІНТЕРНЕТ-МАГАЗИН АВТОТОВАРІВ</p>
              <h1>Запчастини, що тримають <em>пульс</em> вашого авто</h1>
              <p className="lead">Оливи, фільтри, гальма та електрика від перевірених брендів. Підбір за VIN-кодом і доставка по всій Україні.</p>
              <div className="hero-actions">
                <a className="btn" href="#catalog">До каталогу</a>
                <a className="btn btn-ghost" href="#assistant">Запитати консультанта</a>
              </div>
            </div>
            <div className="hero-card">
              <div className="pulse-line" aria-hidden="true">
                <svg viewBox="0 0 300 80"><path d="M0 45h70l15-30 20 55 18-40 12 15h165"/></svg>
              </div>
              <ul>
                <li><b>{products.length || '—'}</b> товарів у каталозі</li>
                <li><b>{categories.length > 1 ? categories.length - 1 : '—'}</b> категорії</li>
                <li><b>24/7</b> AI-консультант</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="features">
          <div className="container features-grid">
            <div>✔ ОРИГІНАЛЬНІ БРЕНДИ</div><div>✔ ПІДБІР ЗА VIN</div><div>✔ ДИНАМІЧНИЙ КАТАЛОГ</div><div>✔ ШВИДКЕ ЗАМОВЛЕННЯ</div>
          </div>
        </section>

        <section className="section" id="catalog">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">КАТАЛОГ / ЛАБ №2</p>
              <h2>Популярні автотовари</h2>
            </div>
            <div className="category-filter" role="group" aria-label="Фільтр категорій">
              {categories.map(c => (
                <button key={c} className={c === category ? 'category-btn active' : 'category-btn'}
                        onClick={() => setCategory(c)}>{c}</button>
              ))}
            </div>
            {loading && <p className="feedback">Завантаження каталогу…</p>}
            {loadError && <p className="feedback error">Не вдалося завантажити каталог: {loadError}</p>}
            <div className="products-grid">
              {visible.map(p => (
                <article className="product-card" key={p.id}>
                  <div className={`product-art art-${p.image_key}`}><ProductIcon type={p.image_key} /></div>
                  <div className="product-info">
                    <span className="product-meta">{p.category} · {p.brand}</span>
                    <h3>{p.title}</h3>
                    <p>{p.description}</p>
                    <div className="product-bottom">
                      <strong>{p.price_uah.toLocaleString('uk-UA')} грн</strong>
                      <span className={p.stock > 0 ? 'stock in' : 'stock out'}>
                        {p.stock > 0 ? `в наявності: ${p.stock}` : 'немає'}
                      </span>
                    </div>
                    <button className="btn btn-small" disabled={p.stock === 0} onClick={() => chooseProduct(p.id)}>Замовити</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section dark" id="how">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">ЯК ЦЕ ПРАЦЮЄ</p>
              <h2>Три кроки до потрібної деталі</h2>
            </div>
            <div className="steps-grid">
              <div className="step"><span>01</span><h3>Оберіть товар</h3><p>Скористайтеся фільтром категорій або запитайте AI-консультанта.</p></div>
              <div className="step"><span>02</span><h3>Вкажіть VIN</h3><p>VIN-код допомагає менеджеру перевірити сумісність деталі з авто.</p></div>
              <div className="step"><span>03</span><h3>Отримайте замовлення</h3><p>Доставка Новою Поштою, Укрпоштою або самовивіз.</p></div>
            </div>
            <div className="faq">
              <details><summary>Чи це справжній магазин?</summary><p>Ні, AutoPulse — навчальний проєкт. Замовлення демонстраційні, ціни умовні.</p></details>
              <details><summary>Навіщо вказувати VIN-код?</summary><p>За VIN визначають комплектацію авто, що дозволяє точно підібрати фільтри, колодки та інші деталі.</p></details>
              <details><summary>Як часто міняти моторну оливу?</summary><p>Зазвичай кожні 10–15 тис. км або раз на рік — точний інтервал вказано в регламенті виробника.</p></details>
            </div>
          </div>
        </section>

        <section className="section" id="order">
          <div className="container order-grid">
            <aside className="order-side">
              <p className="eyebrow">ФОРМИ ТА СЕСІЇ / ЛАБ №3–4</p>
              <h2>Оформлення замовлення</h2>
              <p>Дані перевіряються в браузері та на сервері. Ідентифікатор сесії зберігається в HttpOnly-cookie, тому JavaScript сторінки не має до нього доступу.</p>
              {visits !== null && <p className="visit-counter">Відвідувань у цій сесії: {visits}</p>}
              <div className="my-orders">
                <h3>Мої замовлення (поточна сесія)</h3>
                {mine.length === 0 ? <p>Поки що немає замовлень.</p> : mine.map(o => (
                  <p key={o.reference}><b>{o.reference}</b> — {o.product} × {o.quantity}, {o.total_uah} грн, {DELIVERY_LABELS[o.delivery]}, статус: {o.status}</p>
                ))}
              </div>
            </aside>

            <form className="order-form" onSubmit={sendOrder}>
              <label className="form-field">Товар *
                <select required value={form.productId} onChange={e => setField('productId', e.target.value)}>
                  <option value="">— оберіть товар —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.title} — {p.price_uah} грн</option>)}
                </select>
                {errors.productId && <small>{errors.productId}</small>}
              </label>
              <div className="form-row">
                <label className="form-field">Кількість *
                  <input type="number" min="1" max="20" required value={form.quantity}
                         onChange={e => setField('quantity', e.target.value)} />
                  {errors.quantity && <small>{errors.quantity}</small>}
                </label>
                <label className="form-field">Спосіб доставки *
                  <select value={form.delivery} onChange={e => setField('delivery', e.target.value)}>
                    {Object.entries(DELIVERY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label className="form-field">Ім’я та прізвище *
                  <input required minLength="2" maxLength="80" value={form.name}
                         pattern="[A-Za-zА-Яа-яІіЇїЄєҐґ'’\- .]{2,80}"
                         title="Лише літери, пробіл, апостроф або дефіс"
                         onChange={e => setField('name', e.target.value)} />
                  {errors.name && <small>{errors.name}</small>}
                </label>
                <label className="form-field">Телефон *
                  <input type="tel" required value={form.phone} placeholder="+380991234567"
                         onChange={e => setField('phone', e.target.value)} />
                  {errors.phone && <small>{errors.phone}</small>}
                </label>
              </div>
              <div className="form-row">
                <label className="form-field">Місто *
                  <input required minLength="2" maxLength="60" value={form.city}
                         onChange={e => setField('city', e.target.value)} />
                  {errors.city && <small>{errors.city}</small>}
                </label>
                <label className="form-field">VIN-код (необов’язково)
                  <input maxLength="17" value={form.vin} placeholder="17 символів"
                         onChange={e => setField('vin', e.target.value.toUpperCase())} />
                  {errors.vin && <small>{errors.vin}</small>}
                </label>
              </div>
              <label className="form-field">Коментар
                <textarea rows="3" maxLength="500" value={form.comment}
                          onChange={e => setField('comment', e.target.value)} />
              </label>
              <div className="order-total">До сплати: <b>{total.toLocaleString('uk-UA')} грн</b></div>
              <button className="btn" disabled={submitting}>{submitting ? 'Надсилання…' : 'Підтвердити замовлення'}</button>
              <p className="demo-note">Навчальний проєкт: замовлення не передається в доставку. Не вводьте реальні персональні дані.</p>
              {formMessage && <p className={`form-status ${formMessage.type}`}>{formMessage.text}</p>}
            </form>
          </div>
        </section>

        <section className="section dark" id="assistant">
          <div className="container assistant-grid">
            <div>
              <p className="eyebrow">AI-ІНТЕГРАЦІЯ / ЛАБ №6</p>
              <h2>Запитайте AI-консультанта</h2>
              <p>Запитання надсилається на сервер Express, а сервер звертається до AI API разом з актуальним каталогом магазину. Секретний ключ зберігається лише на сервері.</p>
              <p className="ai-note">Консультант надає загальну інформацію. Перед купівлею звірте сумісність деталі за VIN-кодом, а ремонт систем безпеки довірте СТО.</p>
              <div className="ai-examples">
                {['Яку оливу обрати для Skoda Octavia 1.4 TSI?', 'Який акумулятор у вас є?', 'Як часто міняти гальмівну рідину?'].map(q =>
                  <button key={q} type="button" onClick={() => setQuestion(q)}>{q}</button>)}
              </div>
            </div>
            <div className="chat-box">
              <div className="chat-head">AutoPulse Bot</div>
              <div className="chat-messages">
                {chat.length === 0 && <div className="msg bot">Вітаю! Я допоможу підібрати автотовари з каталогу AutoPulse. Що вас цікавить?</div>}
                {chat.map((m, i) => <div key={i} className={`msg ${m.role} ${m.error ? 'error' : ''}`}>{m.text}</div>)}
                {asking && <div className="msg bot typing">Консультант друкує…</div>}
                <div ref={chatEnd} />
              </div>
              <form className="chat-form" onSubmit={ask}>
                <input value={question} maxLength="500" placeholder="Ваше запитання…"
                       onChange={e => setQuestion(e.target.value)} />
                <button disabled={asking || question.trim().length < 3}>Надіслати</button>
              </form>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <span className="logo"><span className="logo-mark">⚡</span>Auto<b>Pulse</b></span>
          <p>Навчальний проєкт з дисципліни «Web-базовані інтелектуальні додатки та сервіси», 2026</p>
          <a href="/openapi.yaml">OpenAPI</a>
        </div>
      </footer>
    </>
  );
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
