"use strict";

const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = "centralRO_activities_v1";

const CATEGORIES = [
  "Estudos", "Trabalho", "Reuniões", "Projetos",
  "Treinamento físico", "Saúde", "Finanças", "Família",
  "Lazer", "Viagens", "Compras", "Pessoal",
  "Compromissos", "Casa", "Outros"
];

const PRIORITIES = ["none", "low", "medium", "high"];

const VIEW_INFO = {
  month: ["Agenda mensal", "Compromissos eventuais do mês. Clique duas vezes em um dia para abri-lo."],
  week: ["Agenda semanal", "Compromissos e rotinas dos sete dias. Clique duas vezes em um dia para abri-lo."],
  day: ["Agenda diária", "Compromissos e rotinas do dia."],
  all: ["Todas as atividades", "Histórico completo dos seus registros."]
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function localISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function addDays(iso, amount) {
  const date = parseDate(iso);
  date.setDate(date.getDate() + amount);
  return localISO(date);
}

function monthStart(iso) {
  const date = parseDate(iso);
  date.setDate(1);
  return localISO(date);
}

function weekStart(iso) {
  const date = parseDate(iso);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return localISO(date);
}

function formatDate(iso, options = {}) {
  return parseDate(iso).toLocaleDateString("pt-BR", options);
}

function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Escapa conteúdo textual antes de utilizá-lo nos templates HTML.
function esc(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function normalizeActivity(item) {
  const isRoutine = item.kind === "routine";
  const isISO = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

  return {
    ...item,
    kind: isRoutine ? "routine" : "event",
    category: CATEGORIES.includes(item.category) ? item.category : "Outros",
    priority: PRIORITIES.includes(item.priority) ? item.priority : "none",
    weekdays: isRoutine && Array.isArray(item.weekdays)
      ? [...new Set(item.weekdays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))]
      : [],
    doneDates: Array.isArray(item.doneDates) ? item.doneDates.filter(isISO) : []
  };
}

function loadActivities() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(item =>
        item &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
        ["pending", "done"].includes(item.status)
      )
      .map(normalizeActivity);
  } catch (error) {
    console.error("Erro ao carregar os dados:", error);
    alert("Não foi possível ler os dados salvos. Verifique o armazenamento do navegador.");
    return [];
  }
}

function fillCategorySelects() {
  const options = CATEGORIES.map(name => `<option>${esc(name)}</option>`).join("");
  $("#activity-category").innerHTML = options;
  $("#category-filter").innerHTML =
    '<option value="all">Todas as categorias</option>' + options;
}

function fillTimeOptions() {
  const options = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    options.push(`<option value="${hh}:${mm}"></option>`);
  }
  $("#time-options").innerHTML = options.join("");
}

fillCategorySelects();
fillTimeOptions();

let activities = loadActivities();
let selectedDate = localISO();
let currentView = "month";
let toastTimer;

function saveActivities() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activities));
    return true;
  } catch (error) {
    console.error("Erro ao salvar:", error);
    showToast("Não foi possível salvar. Exporte os dados e verifique o armazenamento.");
    return false;
  }
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function isOverdue(activity) {
  if (activity.status === "done") return false;

  // Rotinas são hábitos recorrentes: não ficam "atrasadas".
  if (activity.kind === "routine") return false;

  const today = localISO();

  if (activity.date < today) return true;
  if (activity.date > today) return false;

  // Uma atividade de hoje, com horário final, só atrasa após esse horário.
  if (activity.endTime) {
    const now = new Date();
    const currentTime =
      `${String(now.getHours()).padStart(2, "0")}:` +
      `${String(now.getMinutes()).padStart(2, "0")}`;

    return currentTime > activity.endTime;
  }

  // Atividades sem horário não são consideradas atrasadas no próprio dia.
  return false;
}

function filteredActivities() {
  const category = $("#category-filter").value;

  return activities
    .filter(item => category === "all" || item.category === category)
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      (a.startTime || "99:99").localeCompare(b.startTime || "99:99") ||
      a.title.localeCompare(b.title)
    );
}

function byTime(a, b) {
  return (a.startTime || "99:99").localeCompare(b.startTime || "99:99") ||
    a.title.localeCompare(b.title);
}

function routineOccursOn(item, date) {
  return item.kind === "routine" &&
    date >= item.date &&
    item.weekdays.includes(parseDate(date).getDay());
}

// A rotina se repete toda semana; cada data tem a sua própria situação.
function occurrence(item, date) {
  return {
    ...item,
    date,
    status: item.doneDates.includes(date) ? "done" : "pending"
  };
}

// Compromissos eventuais da data e, se pedido, as rotinas que caem nela.
function itemsOn(date, withRoutines = true) {
  const result = [];

  for (const item of filteredActivities()) {
    if (item.kind === "routine") {
      if (withRoutines && routineOccursOn(item, date)) {
        result.push(occurrence(item, date));
      }
    } else if (item.date === date) {
      result.push(item);
    }
  }

  return result.sort(byTime);
}

function getPeriodActivities() {
  const list = filteredActivities();

  if (currentView === "all") return list;

  if (currentView === "day") {
    return itemsOn(selectedDate);
  }

  if (currentView === "week") {
    const start = weekStart(selectedDate);
    return ALL_DAYS.flatMap(i => itemsOn(addDays(start, i)));
  }

  const start = monthStart(selectedDate);
  const nextMonth = parseDate(start);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const end = addDays(localISO(nextMonth), -1);

  // A agenda mensal mostra só compromissos eventuais.
  return list.filter(item =>
    item.kind !== "routine" && item.date >= start && item.date <= end
  );
}

function renderStats() {
  const list = getPeriodActivities();
  // Na aba "Todas", rotinas aparecem como registros e não têm situação própria.
  const countable = list.filter(item => !(currentView === "all" && item.kind === "routine"));
  const done = countable.filter(item => item.status === "done").length;
  const pending = countable.filter(item => item.status === "pending").length;
  const overdue = countable.filter(isOverdue).length;

  $("#total-count").textContent = countable.length;
  $("#done-count").textContent = done;
  $("#pending-count").textContent = pending;
  $("#overdue-count").textContent = overdue;
}

function priorityLabel(priority) {
  return { high: "Alta", medium: "Média", low: "Baixa" }[priority] || "";
}

function weekdaysLabel(days) {
  const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const sorted = [...days].sort((a, b) => a - b);

  if (sorted.length === 7) return "Todos os dias";
  if (sorted.join() === "1,2,3,4,5") return "Seg a sex";
  if (sorted.join() === "0,6") return "Fim de semana";
  return sorted.map(day => names[day]).join(", ");
}

// asRecord: na aba "Todas", a rotina aparece uma única vez (sem checkbox por data).
function activityMarkup(item, asRecord = false) {
  const overdue = isOverdue(item);
  const isRoutine = item.kind === "routine";
  const time = item.startTime
    ? `${esc(item.startTime)}${item.endTime ? "–" + esc(item.endTime) : ""}`
    : "Sem horário";

  const control = isRoutine && asRecord
    ? '<span class="routine-icon" aria-hidden="true">↻</span>'
    : `<input type="checkbox"
        data-action="toggle"
        data-id="${esc(item.id)}"
        data-date="${esc(item.date)}"
        aria-label="Marcar ${esc(item.title)} como concluída"
        ${item.status === "done" ? "checked" : ""}>`;

  const dateText = formatDate(item.date, {
    day: "2-digit", month: "short", year: "numeric"
  });

  const routineTag = isRoutine
    ? `<span class="tag routine">↻ Rotina${asRecord ? " · " + esc(weekdaysLabel(item.weekdays)) : ""}</span>`
    : "";

  return `
    <article class="activity-item ${item.status === "done" ? "is-done" : ""}">
      ${control}

      <div>
        <div class="activity-title">${esc(item.title)}</div>
        ${item.description
          ? `<div class="activity-description">${esc(item.description)}</div>`
          : ""}

        <div class="activity-meta">
          <span>${isRoutine && asRecord ? "A partir de " + dateText : dateText}</span>
          <span>${time}</span>
          <span>${esc(item.category)}</span>
          ${routineTag}
          ${item.priority !== "none"
            ? `<span class="tag ${item.priority}">Prioridade ${priorityLabel(item.priority)}</span>`
            : ""}
          ${overdue ? '<span class="tag overdue">Atrasada</span>' : ""}
        </div>
      </div>

      <div class="item-actions">
        <button type="button" data-action="edit" data-id="${esc(item.id)}"
          aria-label="Editar atividade">Editar</button>
        <button type="button" data-action="delete" data-id="${esc(item.id)}"
          aria-label="Excluir atividade">Excluir</button>
      </div>
    </article>
  `;
}

function renderActivityList(element, list, asRecord = false) {
  element.innerHTML = list.length
    ? list.map(item => activityMarkup(item, asRecord)).join("")
    : '<div class="empty">Nenhuma atividade encontrada neste período.</div>';
}

function renderCalendar() {
  const calendar = $("#calendar");
  const first = parseDate(monthStart(selectedDate));
  const offset = first.getDay();
  const start = addDays(localISO(first), -offset);
  const month = first.getMonth();
  const list = filteredActivities().filter(item => item.kind !== "routine");

  const weekdays = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

  let html = weekdays.map(day =>
    `<div class="weekday">${day}</div>`
  ).join("");

  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    const dayDate = parseDate(date);
    const dayItems = list.filter(item => item.date === date);
    const outside = dayDate.getMonth() !== month;
    const isToday = date === localISO();
    const selected = date === selectedDate;

    const events = dayItems.slice(0, 3).map(item => `
      <div class="day-event ${item.priority === "high" ? "high" : ""} ${item.status === "done" ? "done" : ""}"
        title="${esc(item.title)}">
        ${item.startTime ? esc(item.startTime) + " " : ""}${esc(item.title)}
      </div>
    `).join("");

    const more = dayItems.length > 3
      ? `<div class="more-events">+${dayItems.length - 3} atividade(s)</div>`
      : "";

    html += `
      <div class="calendar-day ${outside ? "outside" : ""} ${selected ? "selected" : ""}"
        data-date="${date}" tabindex="0" role="button"
        aria-label="Selecionar ${formatDate(date)}">
        <div class="day-number">
          <span class="${isToday ? "today-marker" : ""}">${dayDate.getDate()}</span>
          ${dayItems.length ? `<span>${dayItems.length}</span>` : ""}
        </div>
        ${events}${more}
      </div>
    `;
  }

  calendar.innerHTML = html;
}

function renderWeek() {
  const start = weekStart(selectedDate);
  let html = "";

  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    const items = itemsOn(date);
    const today = date === localISO();

    html += `
      <section class="schedule-day" data-date="${date}">
        <div class="schedule-day-heading ${today ? "today" : ""}"
          data-date="${date}" role="button" tabindex="0"
          title="Clique duas vezes para abrir o dia">
          <strong>${formatDate(date, { weekday: "long", day: "2-digit", month: "long" })}</strong>
          <span>${items.length} atividade(s)</span>
        </div>
        <div class="schedule-items">
          ${items.length
            ? items.map(item => activityMarkup(item)).join("")
            : '<div class="empty">Sem atividades programadas.</div>'}
        </div>
      </section>
    `;
  }

  $("#schedule").innerHTML = html;
}

function renderDay() {
  const list = itemsOn(selectedDate);
  $("#schedule").innerHTML = `
    <section class="schedule-day">
      <div class="schedule-day-heading today">
        <strong>${formatDate(selectedDate, {
          weekday: "long", day: "2-digit", month: "long", year: "numeric"
        })}</strong>
        <span>${list.length} atividade(s)</span>
      </div>
      <div class="schedule-items">
        ${list.length
          ? list.map(item => activityMarkup(item)).join("")
          : '<div class="empty">Nenhuma atividade programada para este dia.</div>'}
      </div>
    </section>
  `;
}

function renderSelectedDate() {
  // Na agenda mensal, o detalhe do dia também mostra só compromissos eventuais.
  const list = itemsOn(selectedDate, currentView !== "month");
  $("#selected-title").textContent =
    `Atividades de ${formatDate(selectedDate, {
      day: "2-digit", month: "long", year: "numeric"
    })}`;

  renderActivityList($("#selected-activities"), list);
}

function render() {
  const [title, description] = VIEW_INFO[currentView];

  $("#page-title").textContent = title;
  $("#page-description").textContent = description;

  $("#calendar-view").hidden = currentView !== "month";
  $("#schedule-view").hidden = !["week", "day"].includes(currentView);
  $("#all-view").hidden = currentView !== "all";

  if (currentView === "month") {
    const date = parseDate(selectedDate);
    $("#period-title").textContent = date.toLocaleDateString("pt-BR", {
      month: "long", year: "numeric"
    });
    renderCalendar();
  }

  if (currentView === "week") {
    const start = weekStart(selectedDate);
    const end = addDays(start, 6);
    $("#period-title").textContent =
      `${formatDate(start)} – ${formatDate(end)}`;
    renderWeek();
  }

  if (currentView === "day") {
    $("#period-title").textContent = formatDate(selectedDate, {
      day: "2-digit", month: "long", year: "numeric"
    });
    renderDay();
  }

  if (currentView === "all") {
    $("#period-title").textContent = "Histórico";
    renderActivityList($("#activity-list"), getPeriodActivities(), true);
  }

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.view === currentView);
  });

  renderStats();
  renderSelectedDate();
}

function syncKindUI() {
  const kind = document.querySelector('input[name="activity-kind"]:checked').value;
  const isRoutine = kind === "routine";
  const isEdit = Boolean($("#activity-id").value);

  $("#routine-days").hidden = !isRoutine;
  $("#status-field").hidden = isRoutine;
  $("#date-label").textContent = isRoutine ? "Começa em *" : "Data *";
  $("#dialog-title").textContent =
    `${isEdit ? "Editar" : "Nova"} ${isRoutine ? "rotina" : "atividade"}`;
}

function openForm(activity = null, defaults = {}) {
  $("#activity-form").reset();
  $("#form-error").textContent = "";

  const kind = activity?.kind || defaults.kind || "event";
  const weekdays = activity?.kind === "routine" ? activity.weekdays : ALL_DAYS;

  $("#activity-id").value = activity?.id || "";
  document.querySelector(`input[name="activity-kind"][value="${kind}"]`).checked = true;
  document.querySelectorAll("#weekday-picker input").forEach(box => {
    box.checked = weekdays.includes(Number(box.value));
  });
  syncKindUI();

  $("#activity-title").value = activity?.title || "";
  $("#activity-description").value = activity?.description || "";
  $("#activity-date").value = activity?.date || selectedDate;
  $("#activity-start").value = activity?.startTime || "";
  $("#activity-end").value = activity?.endTime || "";
  $("#activity-category").value = activity?.category || "Estudos";
  $("#activity-priority").value = activity?.priority || "none";
  $("#activity-status").value = activity?.status || "pending";

  $("#activity-dialog").showModal();
  $("#activity-title").focus();
}

function closeForm() {
  $("#activity-dialog").close();
}

function findActivity(id) {
  return activities.find(item => item.id === id);
}

$("#add-activity").addEventListener("click", () => openForm());
$("#add-selected").addEventListener("click", () => openForm());

$("#close-dialog").addEventListener("click", closeForm);
$("#cancel-dialog").addEventListener("click", closeForm);

$("#activity-dialog").addEventListener("click", event => {
  if (event.target === $("#activity-dialog")) closeForm();
});

$("#activity-form").addEventListener("submit", event => {
  event.preventDefault();

  const id = $("#activity-id").value;
  const kind = document.querySelector('input[name="activity-kind"]:checked').value;
  const isRoutine = kind === "routine";
  const weekdays = [...document.querySelectorAll("#weekday-picker input:checked")]
    .map(box => Number(box.value));
  const title = $("#activity-title").value.trim();
  const description = $("#activity-description").value.trim();
  const date = $("#activity-date").value;
  const startTime = $("#activity-start").value.trim();
  const endTime = $("#activity-end").value.trim();
  const category = $("#activity-category").value;
  const priority = $("#activity-priority").value;
  const status = $("#activity-status").value;

  const error = $("#form-error");
  error.textContent = "";

  if (!title || !date) {
    error.textContent = "Título e data são obrigatórios.";
    return;
  }

  if ((startTime && !isValidTime(startTime)) || (endTime && !isValidTime(endTime))) {
    error.textContent = "Use o formato HH:MM, por exemplo 08:30.";
    return;
  }

  if (endTime && !startTime) {
    error.textContent = "Informe também o horário inicial.";
    return;
  }

  if (startTime && endTime && endTime <= startTime) {
    error.textContent = "O horário final deve ser posterior ao inicial.";
    return;
  }

  if (isRoutine && !weekdays.length) {
    error.textContent = "Escolha pelo menos um dia da semana para a rotina.";
    return;
  }

  if (!CATEGORIES.includes(category)) {
    error.textContent = "Selecione uma categoria válida.";
    return;
  }

  if (!PRIORITIES.includes(priority) ||
      !["pending", "done"].includes(status)) {
    error.textContent = "Verifique a prioridade e a situação.";
    return;
  }

  const existing = id ? findActivity(id) : null;

  const activity = {
    id: existing ? existing.id : makeId(),
    title,
    description,
    date,
    startTime,
    endTime,
    category,
    priority,
    kind,
    weekdays: isRoutine ? weekdays : [],
    status: isRoutine ? "pending" : status,
    doneDates: isRoutine ? (existing?.doneDates || []) : [],
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const previous = activities.slice();

  if (existing) {
    activities = activities.map(item => item.id === id ? activity : item);
  } else {
    activities.push(activity);
  }

  if (!saveActivities()) {
    activities = previous;
    return;
  }

  selectedDate = date;
  closeForm();
  render();
  showToast(isRoutine
    ? "Rotina salva. Ela aparece nas agendas semanal e diária."
    : existing ? "Atividade atualizada." : "Atividade cadastrada.");
});

// Duplo clique em um dia: contado manualmente, porque o calendário é
// redesenhado a cada clique e o evento "dblclick" do navegador falha nisso.
let lastDayClick = { date: null, time: 0 };

function isDoubleClick(date) {
  const now = Date.now();
  const isDouble = lastDayClick.date === date && now - lastDayClick.time < 450;
  lastDayClick = isDouble ? { date: null, time: 0 } : { date, time: now };
  return isDouble;
}

function openDay(date) {
  selectedDate = date;
  currentView = "day";
  render();
}

// Eventos delegados: funcionam mesmo depois de recriar o HTML.
document.addEventListener("click", event => {
  const nav = event.target.closest(".nav-btn");

  if (nav) {
    currentView = nav.dataset.view;
    render();
    return;
  }

  const calendarDay = event.target.closest(".calendar-day");
  if (calendarDay) {
    const date = calendarDay.dataset.date;
    if (isDoubleClick(date)) return openDay(date);

    selectedDate = date;
    render();
    return;
  }

  const periodDay = event.target.closest(".schedule-day");
  if (periodDay?.dataset.date &&
      !event.target.closest("button, input, .activity-item")) {
    const date = periodDay.dataset.date;
    if (currentView === "week" && isDoubleClick(date)) return openDay(date);

    selectedDate = date;
    render();
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const { action, id } = actionButton.dataset;
  const activity = findActivity(id);
  if (!activity) return;

  if (action === "edit") {
    openForm(activity);
  }

  if (action === "delete") {
    const question = activity.kind === "routine"
      ? `Excluir a rotina "${activity.title}" de todos os dias? Esta ação não pode ser desfeita.`
      : `Excluir "${activity.title}"? Esta ação não pode ser desfeita.`;
    if (!confirm(question)) return;

    const previous = activities.slice();
    activities = activities.filter(item => item.id !== id);

    if (!saveActivities()) {
      activities = previous;
      return;
    }

    render();
    showToast("Atividade excluída.");
  }
});

document.addEventListener("keydown", event => {
  if (event.key !== "Enter" && event.key !== " ") return;

  const target = event.target.closest(".calendar-day, .schedule-day-heading");
  if (!target) return;

  event.preventDefault();
  selectedDate = target.dataset.date;
  render();
});

document.addEventListener("change", event => {
  const checkbox = event.target.closest('[data-action="toggle"]');
  if (!checkbox) return;

  const activity = findActivity(checkbox.dataset.id);
  if (!activity) return;

  const previous = { status: activity.status, doneDates: activity.doneDates.slice() };

  if (activity.kind === "routine") {
    // Rotina: a conclusão vale só para a data marcada.
    const date = checkbox.dataset.date;
    activity.doneDates = checkbox.checked
      ? [...new Set([...activity.doneDates, date])]
      : activity.doneDates.filter(item => item !== date);
  } else {
    activity.status = checkbox.checked ? "done" : "pending";
  }
  activity.updatedAt = new Date().toISOString();

  if (!saveActivities()) {
    activity.status = previous.status;
    activity.doneDates = previous.doneDates;
    render();
    return;
  }

  render();
  showToast(checkbox.checked ? "Atividade concluída." : "Atividade reaberta.");
});

$("#previous-period").addEventListener("click", () => {
  const date = parseDate(selectedDate);

  if (currentView === "month") {
    date.setDate(1);
    date.setMonth(date.getMonth() - 1);
    selectedDate = localISO(date);
  } else {
    selectedDate = addDays(
      selectedDate,
      currentView === "week" ? -7 : -1
    );
  }

  render();
});

$("#next-period").addEventListener("click", () => {
  const date = parseDate(selectedDate);

  if (currentView === "month") {
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    selectedDate = localISO(date);
  } else {
    selectedDate = addDays(
      selectedDate,
      currentView === "week" ? 7 : 1
    );
  }

  render();
});

$("#today-btn").addEventListener("click", () => {
  selectedDate = localISO();
  render();
});

$("#category-filter").addEventListener("change", render);

$("#export-btn").addEventListener("click", () => {
  const backup = {
    application: "Central RO",
    version: 1,
    exportedAt: new Date().toISOString(),
    activities
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/json;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `central-ro-backup-${localISO()}.json`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Backup exportado.");
});


// ---------- Rotinas, horários e duplo clique ----------

$("#add-routine").addEventListener("click", () => openForm(null, { kind: "routine" }));

document.querySelectorAll('input[name="activity-kind"]').forEach(radio =>
  radio.addEventListener("change", syncKindUI)
);

document.querySelectorAll("[data-days]").forEach(button =>
  button.addEventListener("click", () => {
    const days = button.dataset.days.split(",").map(Number);
    document.querySelectorAll("#weekday-picker input").forEach(box => {
      box.checked = days.includes(Number(box.value));
    });
  })
);

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// Digite só números: "930" vira 09:30, "1845" vira 18:45.
function maskTime(input) {
  let digits = input.value.replace(/\D/g, "");
  if (digits && digits[0] > "2") digits = "0" + digits;
  digits = digits.slice(0, 4);
  input.value = digits.length > 2
    ? `${digits.slice(0, 2)}:${digits.slice(2)}`
    : digits;
}

[$("#activity-start"), $("#activity-end")].forEach(input =>
  input.addEventListener("input", () => maskTime(input))
);

document.querySelectorAll("[data-minutes]").forEach(button =>
  button.addEventListener("click", () => {
    const start = $("#activity-start").value;

    if (!isValidTime(start)) {
      $("#form-error").textContent = "Informe primeiro o horário inicial (ex.: 08:00).";
      $("#activity-start").focus();
      return;
    }

    $("#form-error").textContent = "";
    const [hours, minutes] = start.split(":").map(Number);
    const total = Math.min(hours * 60 + minutes + Number(button.dataset.minutes), 23 * 60 + 59);
    $("#activity-end").value =
      `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  })
);

$("#clear-time").addEventListener("click", () => {
  $("#activity-start").value = "";
  $("#activity-end").value = "";
});

render();
