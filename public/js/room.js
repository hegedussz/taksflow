// Progresszív kiegészítés: a kezdés vagy az időtartam módosításakor frissítjük a naptár kijelölését.
// JavaScript nélkül a „Tovább a foglaláshoz” gomb ugyanúgy működik, az ellenőrzés a szerveren történik.
(() => {
  const form = document.getElementById('booking-form');
  if (!form) return;
  const update = () => {
    const params = new URLSearchParams();
    params.set('week', form.elements.week.value);
    params.set('start', form.elements.start.value);
    params.set('dur', form.elements.dur.value);
    window.location.assign(`${window.location.pathname}?${params.toString()}#panel`);
  };
  form.elements.start.addEventListener('change', update);
  form.elements.dur.addEventListener('change', update);
})();
