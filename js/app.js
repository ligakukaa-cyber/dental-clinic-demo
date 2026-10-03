/* ЭМАЛЬ — онлайн-запись (услуга → врач → дата/время → контакты), прайс с поиском. */
(() => {
  const DOCTORS = window.DOCTORS, SERVICES = window.BOOK_SERVICES, PRICE = window.PRICE, HOURS = window.HOURS;
  const rub = (n) => (n === 0 ? "бесплатно" : "от " + n.toLocaleString("ru-RU") + " ₽");
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  /* ---------- свободное время ---------- */
  // Занятость в демо — детерминированная «случайность» от врача, дня и времени:
  // одинаковая при каждой загрузке, но выглядит как живое расписание.
  const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const slots = (docId, dayIso, now = new Date()) => {
    const day = new Date(dayIso + "T00:00:00");
    const hours = HOURS[day.getDay()];
    if (!hours) return [];
    const out = [];
    for (let m = hours[0] * 60; m < hours[1] * 60; m += 30) {
      const time = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      const at = new Date(`${dayIso}T${time}:00`);
      const past = at - now < 60 * 60 * 1000; // записываем не раньше чем через час
      const busy = hash(`${docId}|${dayIso}|${time}`) % 10 < 4;
      out.push({ time, free: !past && !busy });
    }
    return out;
  };
  window.EMAL_SLOTS = slots;

  const days = (count = 14, now = new Date()) => {
    const list = [];
    for (let i = 0; i < count; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      list.push(d);
    }
    return list;
  };
  const windows = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "окно"
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "окна" : "окон"}`;
  const dayLabel = (d, i) => i === 0 ? "Сегодня" : i === 1 ? "Завтра"
    : d.toLocaleDateString("ru-RU", { weekday: "short" });

  /* ---------- шапка, появление, плавающая кнопка ---------- */
  const nav = document.getElementById("nav");
  const fab = document.querySelector(".call-fab");
  const bookSec = document.getElementById("book");
  const onScroll = () => {
    nav.classList.toggle("stuck", window.scrollY > 30);
    const r = bookSec.getBoundingClientRect();
    fab?.classList.toggle("hide", window.scrollY < 400 || (r.top < window.innerHeight && r.bottom > 0));
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  const io = new IntersectionObserver((items) => {
    items.forEach((it) => { if (it.isIntersecting) { it.target.classList.add("in"); io.unobserve(it.target); } });
  }, { threshold: 0.1 });
  const watch = (root) => root.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));

  /* ---------- ближайшая запись в первом экране ---------- */
  // самое раннее свободное время среди всех врачей
  const nearest = (() => {
    for (const [i, d] of days().entries()) {
      const times = DOCTORS.map((doc) => slots(doc.id, iso(d)).find((x) => x.free)?.time).filter(Boolean).sort();
      if (times.length) {
        const when = i === 0 ? "сегодня" : i === 1 ? "завтра" : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
        return `${when} в ${times[0]}`;
      }
    }
    return "на этой неделе";
  })();
  document.getElementById("nearest").textContent = nearest;

  /* ---------- врачи ---------- */
  document.getElementById("doctorsList").innerHTML = DOCTORS.map((d) => `
    <article class="doc reveal">
      <img src="assets/${d.img}.jpg" alt="${d.name}, ${d.role.toLowerCase()}" loading="lazy">
      <div class="doc-in">
        <b>${d.name}</b><span class="doc-role">${d.role} · стаж ${d.exp} лет</span>
        <p>${d.about}</p>
        <button class="btn btn-line btn-wide" type="button" data-doc="${d.id}">Записаться к врачу</button>
      </div>
    </article>`).join("");

  /* ---------- мастер записи ---------- */
  const st = { step: 0, service: null, doctor: null, day: null, time: null, preDoctor: null };
  const panels = [...document.querySelectorAll(".book-panel")];
  const stepsEl = [...document.querySelectorAll("#bookSteps li")];
  const back = document.getElementById("bookBack");
  const done = document.getElementById("bookDone");
  const navRow = document.getElementById("bookNav");

  const svc = () => SERVICES.find((s) => s.id === st.service);
  const doc = () => DOCTORS.find((d) => d.id === st.doctor);

  const summary = () => {
    document.getElementById("sumService").textContent = svc()?.name || "—";
    document.getElementById("sumDoctor").textContent = doc()?.name || "—";
    document.getElementById("sumPrice").textContent = svc() ? rub(svc().price) : "—";
    document.getElementById("sumWhen").textContent = st.day && st.time
      ? `${new Date(st.day + "T00:00:00").toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}, ${st.time}`
      : "—";
  };

  const go = (step) => {
    st.step = step;
    panels.forEach((p, i) => { p.hidden = i !== step; });
    stepsEl.forEach((li, i) => { li.classList.toggle("on", i === step); li.classList.toggle("ok", i < step); });
    back.disabled = step === 0;
    if (step === 0) renderServices();
    if (step === 1) renderDoctors();
    if (step === 2) renderDays();
    summary();
  };

  const renderServices = () => {
    const list = st.preDoctor ? SERVICES.filter((s) => s.doctors.includes(st.preDoctor)) : SERVICES;
    document.getElementById("optServices").innerHTML = list.map((s) => `
      <button type="button" class="opt${s.id === st.service ? " on" : ""}" data-service="${s.id}">
        <b>${s.name}</b><span>${rub(s.price)} · ${s.dur} мин</span></button>`).join("");
  };
  const renderDoctors = () => {
    const list = DOCTORS.filter((d) => svc().doctors.includes(d.id));
    document.getElementById("optDoctors").innerHTML = list.map((d) => `
      <button type="button" class="doc-opt${d.id === st.doctor ? " on" : ""}" data-doctor="${d.id}">
        <img src="assets/${d.img}.jpg" alt="" loading="lazy">
        <span><b>${d.name}</b><i>${d.role} · ${d.exp} лет</i></span></button>`).join("");
  };
  const renderDays = () => {
    const list = days();
    if (!st.day) {
      const firstFree = list.find((d) => slots(st.doctor, iso(d)).some((x) => x.free));
      st.day = firstFree ? iso(firstFree) : iso(list[0]);
    }
    document.getElementById("optDays").innerHTML = list.map((d, i) => {
      const free = slots(st.doctor, iso(d)).filter((x) => x.free).length;
      return `<button type="button" role="radio" aria-checked="${iso(d) === st.day}" class="day${iso(d) === st.day ? " on" : ""}"
        data-day="${iso(d)}" ${free ? "" : "disabled"}>
        <i>${dayLabel(d, i)}</i><b>${d.getDate()}</b><span>${free ? windows(free) : HOURS[d.getDay()] ? "занято" : "выходной"}</span></button>`;
    }).join("");
    renderSlots();
  };
  const renderSlots = () => {
    const list = slots(st.doctor, st.day);
    const free = list.filter((x) => x.free);
    document.getElementById("slotsEmpty").hidden = free.length > 0;
    document.getElementById("optSlots").innerHTML = list.map((x) => `
      <button type="button" role="radio" aria-checked="${x.time === st.time}" class="slot${x.time === st.time ? " on" : ""}"
        data-time="${x.time}" ${x.free ? "" : "disabled"}>${x.time}</button>`).join("");
  };

  document.getElementById("bookBox").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.service) {
      st.service = b.dataset.service;
      const docs = svc().doctors;
      st.doctor = st.preDoctor && docs.includes(st.preDoctor) ? st.preDoctor : docs.length === 1 ? docs[0] : null;
      st.day = null; st.time = null;
      go(st.doctor && docs.length === 1 ? 2 : st.doctor ? 2 : 1);
    } else if (b.dataset.doctor) {
      st.doctor = b.dataset.doctor; st.day = null; st.time = null; go(2);
    } else if (b.dataset.day) {
      st.day = b.dataset.day; st.time = null; renderDays(); summary();
    } else if (b.dataset.time) {
      st.time = b.dataset.time; go(3);
    }
  });
  back.addEventListener("click", () => {
    // назад через шаг «врач», если врач был единственным
    let s = st.step - 1;
    if (s === 1 && svc() && svc().doctors.length === 1) s = 0;
    go(Math.max(0, s));
  });

  document.getElementById("doctorsList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-doc]");
    if (!b) return;
    Object.assign(st, { preDoctor: b.dataset.doc, service: null, doctor: null, day: null, time: null });
    go(0);
    bookSec.scrollIntoView({ behavior: "smooth" });
  });

  /* ---------- контакты и подтверждение ---------- */
  const form = document.getElementById("bookForm");
  const bad = (input, text) => {
    const f = input.closest(".field, .check");
    f.classList.add("bad");
    if (text && !f.querySelector(".err")) {
      const p = document.createElement("p"); p.className = "err"; p.textContent = text; f.appendChild(p);
    }
  };
  const clean = (input) => { const f = input.closest(".field, .check"); f.classList.remove("bad"); f.querySelector(".err")?.remove(); };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("name"), phone = document.getElementById("phone"), agree = document.getElementById("agree");
    [name, phone, agree].forEach(clean);
    let ok = true;
    if (name.value.trim().length < 2) { bad(name, "Как к вам обращаться?"); ok = false; }
    if (phone.value.replace(/\D/g, "").length < 10) { bad(phone, "Проверьте номер"); ok = false; }
    if (!agree.checked) { bad(agree); ok = false; }
    if (!ok) return;
    document.getElementById("doneText").textContent =
      `${svc().name}, ${doc().name} — ${document.getElementById("sumWhen").textContent}. ` +
      "Администратор позвонит в течение 15 минут, чтобы подтвердить запись.";
    panels.forEach((p) => { p.hidden = true; });
    navRow.hidden = true;
    done.hidden = false;
    stepsEl.forEach((li) => { li.classList.remove("on"); li.classList.add("ok"); });
  });
  document.getElementById("bookAgain").addEventListener("click", () => {
    form.reset();
    Object.assign(st, { service: null, doctor: null, day: null, time: null, preDoctor: null });
    done.hidden = true; navRow.hidden = false;
    go(0);
  });
  document.getElementById("phone").addEventListener("input", (e) => {
    const d = e.target.value.replace(/\D/g, "").slice(0, 11);
    if (!d) { e.target.value = ""; return; }
    const b = d.length === 11 ? d.slice(1) : d;
    const parts = [b.slice(0, 3), b.slice(3, 6), b.slice(6, 8), b.slice(8, 10)];
    e.target.value = "+7 " + parts[0] + (parts[1] ? " " + parts[1] : "") + (parts[2] ? "-" + parts[2] : "") + (parts[3] ? "-" + parts[3] : "");
  });

  /* ---------- прайс ---------- */
  const cats = ["Все", ...new Set(PRICE.map((p) => p[0]))];
  let cat = "Все";
  const search = document.getElementById("priceSearch");
  const catsEl = document.getElementById("priceCats");
  const renderPrice = () => {
    const q = search.value.trim().toLowerCase();
    const rows = PRICE.filter(([c, n]) => (cat === "Все" || c === cat) && (!q || n.toLowerCase().includes(q) || c.toLowerCase().includes(q)));
    catsEl.innerHTML = cats.map((c) => `<button type="button" class="${c === cat ? "on" : ""}" data-cat="${c}">${c}</button>`).join("");
    document.getElementById("priceList").innerHTML = rows.map(([c, n, p]) =>
      `<li><span>${n}${cat === "Все" ? `<i>${c}</i>` : ""}</span><b>${rub(p)}</b></li>`).join("");
    document.getElementById("priceEmpty").hidden = rows.length > 0;
  };
  catsEl.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { cat = b.dataset.cat; renderPrice(); } });
  search.addEventListener("input", renderPrice);
  renderPrice();

  go(0);
  watch(document);
})();
