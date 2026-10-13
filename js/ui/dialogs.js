// Small promise-based dialogs built on the native <dialog> element (focus trap, Esc to close, backdrop).
import { esc } from "./dom.js";

function open(html, { onMount } = {}) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.innerHTML = html;
    document.body.appendChild(d);
    let result = null;
    const close = (v) => { result = v; d.close(); };
    d.addEventListener("close", () => { d.remove(); resolve(result); });
    d.addEventListener("click", (e) => {
      const b = e.target.closest("[data-result]");
      if (b) close(b.getAttribute("data-result"));
      else if (e.target === d) close(null);
    });
    onMount?.(d, close);
    d.showModal();
  });
}

export function confirmDialog({ title, body, ok = "OK", cancel = "Cancel", danger = false }) {
  return open(`<h2>${esc(title)}</h2><p>${body}</p><div class="btns"><button data-result="cancel">${esc(cancel)}</button><button class="primary" data-result="ok"${danger ? ' style="background:var(--red);border-color:var(--red)"' : ""}>${esc(ok)}</button></div>`).then((r) => r === "ok");
}

export function askText({ title, label, value = "", ok = "Save", max = 80 }) {
  return open(`<h2>${esc(title)}</h2><form method="dialog"><label class="f">${esc(label)}<input name="v" maxlength="${max}" value="${esc(value)}" autocomplete="off"></label><div class="btns"><button type="button" data-result="__cancel">Cancel</button><button class="primary" value="ok">${esc(ok)}</button></div></form>`, {
    onMount(d, close) {
      const input = d.querySelector("input");
      d.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); close(input.value); });
      setTimeout(() => { input.focus(); input.select(); }, 0);
    },
  }).then((r) => (r === null || r === "__cancel" ? null : r));
}

// Generic: html string with [data-result] buttons. Resolves to the clicked value, or null if dismissed.
export function choose(html, opts) { return open(html, opts); }

let toastTimer;
export function toast(msg, ms = 4200) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
