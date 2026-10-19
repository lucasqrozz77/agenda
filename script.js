
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
  month: ["Agenda mensal", "Visão geral das atividades do mês."],
  week: ["Agenda semanal", "Organize os compromissos dos sete dias."],
  day: ["Agenda diária", "Consulte e gerencie as atividades do dia."],
  all: ["Todas as atividades", "Histórico completo dos seus registros."]
};

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
      .map(item => ({
        ...item,
        category: CATEGORIES.includes(item.category) ? item.category : "Outros",
        priority: PRIORITIES.includes(item.priority) ? item.priority : "none"
      }));
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

fillCategorySelects();

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

function getPeriodActivities() {
  const list = filteredActivities();

  if (currentView === "all") return list;

  if (currentView === "day") {
    return list.filter(item => item.date === selectedDate);
  }

  if (currentView === "week") {
    const start = weekStart(selectedDate);
    const end = addDays(start, 6);
    return list.filter(item => item.date >= start && item.date <= end);
  }

  const start = monthStart(selectedDate);
  const nextMonth = parseDate(start);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const end = addDays(localISO(nextMonth), -1);

  return list.filter(item => item.date >= start && item.date <= end);
}

function renderStats() {
  const list = getPeriodActivities();
  const done = list.filter(item => item.status === "done").length;
  const pending = list.filter(item => item.status === "pending").length;
  const overdue = list.filter(isOverdue).length;

  $("#total-count").textContent = list.length;
  $("#done-count").textContent = done;
  $("#pending-count").textContent = pending;
  $("#overdue-count").textContent = overdue;
}

function priorityLabel(priority) {
  return { high: "Alta", medium: "Média", low: "Baixa" }[priority] || "";
}

function activityMarkup(item) {
  const overdue = isOverdue(item);
  const time = item.startTime
    ? `${esc(item.startTime)}${item.endTime ? "–" + esc(item.endTime) : ""}`
    : "Sem horário";

  return `
    <article class="activity-item ${item.status === "done" ? "is-done" : ""}">
      <input type="checkbox"
        data-action="toggle"
        data-id="${esc(item.id)}"
        aria-label="Marcar ${esc(item.title)} como concluída"
        ${item.status === "done" ? "checked" : ""}>

      <div>
        <div class="activity-title">${esc(item.title)}</div>
        ${item.description
          ? `<div class="activity-description">${esc(item.description)}</div>`
          : ""}

        <div class="activity-meta">
          <span>${formatDate(item.date, {
            day: "2-digit", month: "short", year: "numeric"
          })}</span>
          <span>${time}</span>
          <span>${esc(item.category)}</span>
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

function renderActivityList(element, list) {
  element.innerHTML = list.length
    ? list.map(activityMarkup).join("")
    : '<div class="empty">Nenhuma atividade encontrada neste período.</div>';
}

function renderCalendar() {
  const calendar = $("#calendar");
  const first = parseDate(monthStart(selectedDate));
  const offset = first.getDay();
  const start = addDays(localISO(first), -offset);
  const month = first.getMonth();
  const list = filteredActivities();

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
  const list = filteredActivities();
  let html = "";

  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    const items = list.filter(item => item.date === date);
    const today = date === localISO();

    html += `
      <section class="schedule-day">
        <div class="schedule-day-heading ${today ? "today" : ""}"
          data-date="${date}" role="button" tabindex="0">
          <strong>${formatDate(date, { weekday: "long", day: "2-digit", month: "long" })}</strong>
          <span>${items.length} atividade(s)</span>
        </div>
        <div class="schedule-items">
          ${items.length
            ? items.map(activityMarkup).join("")
            : '<div class="empty">Sem atividades programadas.</div>'}
        </div>
      </section>
    `;
  }

  $("#schedule").innerHTML = html;
}

function renderDay() {
  const list = filteredActivities().filter(item => item.date === selectedDate);
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
          ? list.map(activityMarkup).join("")
          : '<div class="empty">Nenhuma atividade programada para este dia.</div>'}
      </div>
    </section>
  `;
}

function renderSelectedDate() {
  const list = filteredActivities().filter(item => item.date === selectedDate);
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
    renderActivityList($("#activity-list"), getPeriodActivities());
  }

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.view === currentView);
  });

  renderStats();
  renderSelectedDate();
}

function openForm(activity = null) {
  $("#activity-form").reset();
  $("#form-error").textContent = "";

  $("#activity-id").value = activity?.id || "";
  $("#dialog-title").textContent = activity ? "Editar atividade" : "Nova atividade";
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
  const title = $("#activity-title").value.trim();
  const description = $("#activity-description").value.trim();
  const date = $("#activity-date").value;
  const startTime = $("#activity-start").value;
  const endTime = $("#activity-end").value;
  const category = $("#activity-category").value;
  const priority = $("#activity-priority").value;
  const status = $("#activity-status").value;

  const error = $("#form-error");
  error.textContent = "";

  if (!title || !date) {
    error.textContent = "Título e data são obrigatórios.";
    return;
  }

  if (startTime && endTime && endTime <= startTime) {
    error.textContent = "O horário final deve ser posterior ao inicial.";
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
    status,
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
  showToast(existing ? "Atividade atualizada." : "Atividade cadastrada.");
});

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
    selectedDate = calendarDay.dataset.date;
    render();
    return;
  }

  const periodDay = event.target.closest(".schedule-day-heading");
  if (periodDay?.dataset.date) {
    selectedDate = periodDay.dataset.date;
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
    if (!confirm(`Excluir "${activity.title}"? Esta ação não pode ser desfeita.`)) return;

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

  const previousStatus = activity.status;
  activity.status = checkbox.checked ? "done" : "pending";
  activity.updatedAt = new Date().toISOString();

  if (!saveActivities()) {
    activity.status = previousStatus;
    render();
    return;
  }

  render();
  showToast(activity.status === "done"
    ? "Atividade concluída."
    : "Atividade reaberta.");
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

render();
