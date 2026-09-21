(function () {
  "use strict";

  var config = window.SCHEDULE_CONFIG || {};
  var APP_NAME = config.groupName || "技術部スケジュール管理表";
  var PASS_KEY = "schedule_passcode_v1";

  var lockScreen = document.getElementById("lock-screen");
  var lockForm = document.getElementById("lock-form");
  var lockInput = document.getElementById("lock-input");
  var lockError = document.getElementById("lock-error");
  var setupNotice = document.getElementById("setup-notice");
  var appRoot = document.getElementById("app");

  function isPlaceholder(v) {
    return !v || /^(YOUR_|CHANGE_ME)/.test(v);
  }

  if (
    isPlaceholder(config.supabaseUrl) ||
    isPlaceholder(config.supabaseAnonKey) ||
    isPlaceholder(config.passcode)
  ) {
    setupNotice.hidden = false;
    return;
  }

  var supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  // ================= Ported board app (Supabase-backed) =================
  // Everything below is defined unconditionally so that `state`, `render`,
  // and `boot` all exist before the passcode gate at the bottom of this
  // file can call them.

  function showErrorBanner(msg) {
    var existing = document.getElementById("psjErrorBanner");
    if (existing) existing.remove();
    var bar = document.createElement("div");
    bar.id = "psjErrorBanner";
    bar.style.cssText = "position:sticky;top:0;z-index:999;background:#B3413A;color:#fff;padding:10px 14px;font-size:12.5px;font-family:sans-serif;display:flex;justify-content:space-between;gap:10px;align-items:flex-start;";
    var text = document.createElement("div");
    text.style.cssText = "white-space:pre-wrap;word-break:break-word;";
    text.textContent = "エラーが発生しました。この内容をそのまま管理者に伝えてください:\n" + msg;
    var closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style.cssText = "background:none;border:none;color:#fff;font-size:16px;cursor:pointer;flex-shrink:0;";
    closeBtn.onclick = function () { bar.remove(); };
    bar.appendChild(text); bar.appendChild(closeBtn);
    document.body.insertBefore(bar, document.body.firstChild);
  }
  window.addEventListener("error", function (e) {
    showErrorBanner(e.message || "unknown error");
  });
  window.addEventListener("unhandledrejection", function (e) {
    var reason = e.reason;
    showErrorBanner("Promise rejection: " + (reason && reason.message ? reason.message : String(reason)));
  });

  var safeStorage = {
    get: function (key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
    set: function (key, value) { try { window.localStorage.setItem(key, value); } catch (e) {} },
  };

  function showNotice(msg) {
    var existing = document.getElementById("psjNotice");
    if (existing) existing.remove();
    var bar = document.createElement("div");
    bar.id = "psjNotice";
    bar.style.cssText = "position:sticky;top:0;z-index:999;background:#33587D;color:#fff;padding:10px 14px;font-size:12.5px;font-family:sans-serif;display:flex;justify-content:space-between;gap:10px;align-items:flex-start;";
    var text = document.createElement("div");
    text.style.cssText = "white-space:pre-wrap;word-break:break-word;";
    text.textContent = msg;
    var closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style.cssText = "background:none;border:none;color:#fff;font-size:16px;cursor:pointer;flex-shrink:0;";
    closeBtn.onclick = function () { bar.remove(); };
    bar.appendChild(text); bar.appendChild(closeBtn);
    document.body.insertBefore(bar, document.body.firstChild);
  }
  function showConfirmDialog(message, onConfirm) {
    var existing = document.getElementById("psjConfirmDialog");
    if (existing) existing.remove();
    var overlay = document.createElement("div");
    overlay.id = "psjConfirmDialog";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(20,24,26,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:sans-serif;";
    var box = document.createElement("div");
    box.style.cssText = "background:#fff;border-radius:12px;padding:20px;max-width:360px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.25);";
    var text = document.createElement("div");
    text.style.cssText = "font-size:13.5px;color:#1B211D;margin-bottom:16px;white-space:pre-wrap;";
    text.textContent = message;
    var btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";
    var cancelBtn = document.createElement("button");
    cancelBtn.textContent = "キャンセル";
    cancelBtn.style.cssText = "padding:7px 14px;border-radius:20px;border:1px solid #D9DED7;background:#fff;color:#1B211D;font-size:13px;cursor:pointer;";
    cancelBtn.onclick = function () { overlay.remove(); };
    var okBtn = document.createElement("button");
    okBtn.textContent = "OK";
    okBtn.style.cssText = "padding:7px 14px;border-radius:20px;border:none;background:#33587D;color:#fff;font-size:13px;cursor:pointer;";
    okBtn.onclick = function () { overlay.remove(); onConfirm(); };
    btnRow.appendChild(cancelBtn); btnRow.appendChild(okBtn);
    box.appendChild(text); box.appendChild(btnRow);
    overlay.appendChild(box);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  var PALETTE = ["#F8C6C9","#FBD2B0","#FCE1A8","#F1E6A6","#DCEEAE","#C3E8C9","#B9E8D4","#AEE2DC","#B3E0E8","#BBD8F0","#C7CBF2","#D8C9F2","#E7C4EC","#F3C7DA","#D9DCE1","#CDD3DA"];

  function staffByName(name) {
    if (!name) return null;
    return state.staff.find(function (m) { return m.name === name; }) || null;
  }

  function eventColor(ev) {
    if (state.colorMode === "staff") {
      var member = staffByName(ev.staff && ev.staff[0]);
      if (member) return { fg: member.color, bg: member.color + "26", chipFg: "#1B211D", chipBg: member.color };
    }
    var base = ev.type === "demo" ? { fg: "var(--demo)", bg: "var(--demo-bg)" }
      : ev.type === "request" ? { fg: "var(--request)", bg: "var(--request-bg)" }
      : { fg: "var(--tech)", bg: "var(--tech-bg)" };
    base.chipFg = base.fg;
    base.chipBg = base.bg;
    return base;
  }

  function categoryById(id) {
    if (!id) return null;
    return state.categories.find(function (c) { return c.id === id; }) || null;
  }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function fmtDate(y, m, d) { return y + "-" + pad2(m) + "-" + pad2(d); }
  function todayStr() { var t = new Date(); return fmtDate(t.getFullYear(), t.getMonth() + 1, t.getDate()); }
  function parseYMD(s) { var p = s.split("-").map(Number); return { y: p[0], m: p[1], d: p[2] }; }
  var WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];
  var MONTH_LABEL = function (y, m) { return y + "年" + m + "月"; };

  var state = {
    db: false,
    dbReady: false,
    viewYear: null,
    viewMonth: null,
    events: [],
    staff: [],
    equipment: [],
    categories: [],
    salesStaff: [],
    mainView: safeStorage.get("psj_mainview") || "month",
    colorMode: safeStorage.get("psj_colormode") || "type",
    selectedDate: null,
    editingEvent: null,
    formDraft: null,
    showSettings: false,
    showForm: false,
    syncStale: false,
    myName: safeStorage.get("psj_myname") || "",
  };

  function requireDb() {
    if (state.db) return true;
    showNotice("サーバーへの接続中です。数秒待ってからもう一度お試しください。");
    return false;
  }

  (function initMonth() {
    var t = new Date();
    state.viewYear = t.getFullYear();
    state.viewMonth = t.getMonth() + 1;
  })();

  function eventOccursOn(e, dateStr) {
    if (e.type === "request") {
      return e.date === dateStr || e.desiredDate2 === dateStr || e.desiredDate3 === dateStr;
    }
    var end = e.endDate || e.date;
    return e.date <= dateStr && dateStr <= end;
  }

  function eventsOnDate(dateStr) {
    return state.events.filter(function (e) {
      return eventOccursOn(e, dateStr);
    }).sort(function (a, b) { return (a.type === b.type) ? 0 : (a.type === "demo" ? -1 : 1); });
  }

  function equipmentStatusForDate(dateStr) {
    var booked = {};
    state.events.forEach(function (e) {
      if (e.type !== "demo" || !e.equipment) return;
      var end = e.endDate || e.date;
      if (e.date <= dateStr && dateStr <= end) {
        e.equipment.forEach(function (eq) { booked[eq] = e; });
      }
    });
    return state.equipment.map(function (eq) {
      return { id: eq.id, name: eq.name, bookedBy: booked[eq.id] || null };
    });
  }

  function render() {
    try {
      var root = appRoot;
      root.innerHTML = "";
      root.appendChild(renderHeader());
      root.appendChild(renderLegend());
      root.appendChild(
        state.mainView === "member" ? renderMemberGrid() :
        state.mainView === "request" ? renderRequestList() :
        renderCalendar()
      );
      if (state.selectedDate && !state.showForm) root.appendChild(renderDayPanel());
      if (state.showForm) root.appendChild(renderFormModal());
      if (state.showSettings) root.appendChild(renderSettingsModal());
    } catch (err) {
      showErrorBanner(err && err.message ? err.message : String(err));
      throw err;
    }
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }

  function renderHeader() {
    var wrap = el("div", { style: "display:flex;flex-wrap:wrap;align-items:center;gap:14px;justify-content:space-between;margin-bottom:14px;" });

    var statusLine = APP_NAME + "の予定とデモスケジュールをまとめて共有";
    var statusColor = "var(--ink-faint)";
    if (!state.dbReady) { statusLine = "サーバーに接続中…"; statusColor = "var(--demo)"; }
    else if (!state.db) { statusLine = "オフラインのため保存できません(再読み込みしてください)"; statusColor = "var(--bad)"; }
    else if (state.syncStale) { statusLine = "⚠ 同期が不安定です。再接続を試みています"; statusColor = "var(--bad)"; }

    var titleBlock = el("div", { style: "display:flex;flex-direction:column;gap:2px;" }, [
      el("h1", { style: "font-size:22px;letter-spacing:.02em;" }, [APP_NAME]),
      el("div", { style: "font-size:12.5px;color:" + statusColor + ";" }, [statusLine])
    ]);

    var nav = el("div", { style: "display:flex;align-items:center;gap:10px;" });
    var prevBtn = el("button", { style: navBtnStyle(), onclick: function () { shiftMonth(-1); } }, ["‹"]);
    var nextBtn = el("button", { style: navBtnStyle(), onclick: function () { shiftMonth(1); } }, ["›"]);
    var label = el("div", { class: "tabular", style: "font-size:17px;font-weight:700;min-width:108px;text-align:center;" }, [MONTH_LABEL(state.viewYear, state.viewMonth)]);
    var todayBtn = el("button", { style: pillBtnStyle(false), onclick: function () { var t = new Date(); state.viewYear = t.getFullYear(); state.viewMonth = t.getMonth() + 1; render(); } }, ["今日"]);
    nav.appendChild(prevBtn); nav.appendChild(label); nav.appendChild(nextBtn); nav.appendChild(todayBtn);

    var rightBlock = el("div", { style: "display:flex;align-items:center;gap:8px;flex-wrap:wrap;" });
    var nameWrap = el("div", { style: "display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink-soft);" });
    nameWrap.appendChild(document.createTextNode("あなた:"));
    var nameSelect = el("select", { style: selectStyle(), onchange: function (ev) { state.myName = ev.target.value; safeStorage.set("psj_myname", state.myName); render(); } });
    nameSelect.appendChild(el("option", { value: "" }, ["(未選択)"]));
    state.staff.forEach(function (m) {
      var o = el("option", { value: m.name }, [m.name]);
      if (m.name === state.myName) o.selected = true;
      nameSelect.appendChild(o);
    });
    nameWrap.appendChild(nameSelect);

    var addBtn = el("button", { style: pillBtnStyle(true), onclick: function () { openForm(null, state.selectedDate || todayStr()); } }, ["+ 予定を追加"]);
    var settingsBtn = el("button", { style: iconBtnStyle(), title: "スタッフ・装置・作業種類の設定", onclick: function () { state.showSettings = true; render(); } }, ["⚙"]);

    rightBlock.appendChild(nameWrap);
    rightBlock.appendChild(addBtn);
    rightBlock.appendChild(settingsBtn);

    wrap.appendChild(titleBlock);
    wrap.appendChild(nav);
    wrap.appendChild(rightBlock);
    return wrap;
  }

  function navBtnStyle() { return "width:30px;height:30px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--ink);font-size:16px;line-height:1;"; }
  function pillBtnStyle(primary) {
    return "padding:7px 14px;border-radius:20px;border:1px solid " + (primary ? "transparent" : "var(--border)") + ";background:" + (primary ? "var(--tech)" : "var(--surface)") + ";color:" + (primary ? "#fff" : "var(--ink)") + ";font-size:13px;font-weight:500;white-space:nowrap;";
  }
  function iconBtnStyle() { return "width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--ink-soft);font-size:15px;"; }
  function selectStyle() { return "padding:5px 8px;border-radius:7px;border:1px solid var(--border);background:var(--surface);color:var(--ink);font-size:12.5px;"; }
  function inputStyle() { return "padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--ink);font-size:13.5px;width:100%;font-family:inherit;"; }

  function renderLegend() {
    var wrap = el("div", { style: "display:flex;flex-direction:column;gap:10px;margin-bottom:12px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);font-size:12.5px;color:var(--ink-soft);" });

    var top = el("div", { style: "display:flex;flex-wrap:wrap;gap:14px;align-items:center;" });

    var viewRow = el("div", { style: "display:flex;gap:4px;align-items:center;" });
    viewRow.appendChild(el("span", { style: "color:var(--ink-faint);margin-right:2px;" }, ["表示:"]));
    var pendingRequests = state.events.filter(function (e) { return e.type === "request"; }).length;
    [["month", "月"], ["member", "メンバー別"], ["request", "デモリクエスト一覧" + (pendingRequests ? "(" + pendingRequests + ")" : "")]].forEach(function (pair) {
      var active = state.mainView === pair[0];
      var accent = pair[0] === "request" ? "var(--request)" : "var(--tech)";
      var accentBg = pair[0] === "request" ? "var(--request-bg)" : "var(--tech-bg)";
      viewRow.appendChild(el("button", {
        type: "button",
        style: "padding:4px 10px;border-radius:14px;border:1px solid " + (active ? accent : "var(--border)") + ";background:" + (active ? accentBg : "var(--surface)") + ";color:" + (active ? accent : "var(--ink-soft)") + ";font-size:11.5px;font-weight:500;",
        onclick: function () { state.mainView = pair[0]; safeStorage.set("psj_mainview", pair[0]); render(); }
      }, [pair[1]]));
    });
    top.appendChild(viewRow);
    top.appendChild(el("div", { style: "width:1px;height:16px;background:var(--border);" }));

    var modeRow = el("div", { style: "display:flex;gap:4px;align-items:center;" });
    modeRow.appendChild(el("span", { style: "color:var(--ink-faint);margin-right:2px;" }, ["色分け:"]));
    [["type", "種別"], ["staff", "担当者"]].forEach(function (pair) {
      var active = state.colorMode === pair[0];
      modeRow.appendChild(el("button", {
        type: "button",
        style: "padding:4px 10px;border-radius:14px;border:1px solid " + (active ? "var(--tech)" : "var(--border)") + ";background:" + (active ? "var(--tech-bg)" : "var(--surface)") + ";color:" + (active ? "var(--tech)" : "var(--ink-soft)") + ";font-size:11.5px;font-weight:500;",
        onclick: function () { state.colorMode = pair[0]; safeStorage.set("psj_colormode", pair[0]); render(); }
      }, [pair[1]]));
    });
    top.appendChild(modeRow);

    top.appendChild(el("div", { style: "width:1px;height:16px;background:var(--border);" }));
    top.appendChild(el("div", {}, ["装置: " + state.equipment.map(function (e) { return e.name; }).join(" / ")]));
    wrap.appendChild(top);

    var swatchRow = el("div", { style: "display:flex;flex-wrap:wrap;gap:12px;" });
    if (state.colorMode === "staff") {
      state.staff.forEach(function (m) { swatchRow.appendChild(legendDot(m.color, m.name)); });
    } else {
      swatchRow.appendChild(legendDot("var(--tech)", "技術部予定"));
      swatchRow.appendChild(legendDot("var(--demo)", "デモ予定"));
      swatchRow.appendChild(legendDot("var(--request)", "デモリクエスト(未確定)"));
    }
    wrap.appendChild(swatchRow);

    return wrap;
  }
  function weekdayColor(dow) {
    if (dow === 6) return "var(--sat)";
    if (dow === 0) return "var(--sun)";
    return null;
  }

  function legendDot(color, label) {
    return el("div", { style: "display:flex;align-items:center;gap:6px;" }, [
      el("span", { style: "width:9px;height:9px;border-radius:50%;background:" + color + ";display:inline-block;flex-shrink:0;" }),
      el("span", {}, [label])
    ]);
  }

  function renderCalendar() {
    var y = state.viewYear, m = state.viewMonth;
    var first = new Date(y, m - 1, 1);
    var mondayOffset = (first.getDay() + 6) % 7;
    var gridStart = new Date(y, m - 1, 1 - mondayOffset);

    var wrap = el("div", { style: "background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;" });

    var headRow = el("div", { style: "display:grid;grid-template-columns:repeat(7,1fr);" });
    ["月", "火", "水", "木", "金", "土", "日"].forEach(function (wd, i) {
      var dow = (i + 1) % 7; // Monday-start index -> JS getDay() (0=Sun..6=Sat)
      var wdColor = weekdayColor(dow) || "var(--ink-soft)";
      headRow.appendChild(el("div", { style: "padding:8px 6px;font-size:11.5px;font-weight:500;color:" + wdColor + ";text-align:center;border-bottom:1px solid var(--border);" }, [wd]));
    });
    wrap.appendChild(headRow);

    var grid = el("div", { style: "display:grid;grid-template-columns:repeat(7,1fr);" });
    var today = todayStr();

    for (var i = 0; i < 42; i++) {
      var d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      var dateStr = fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
      var inMonth = (d.getMonth() + 1 === m);
      var isToday = dateStr === today;
      var dayEvents = eventsOnDate(dateStr);
      var eq = equipmentStatusForDate(dateStr);
      var bookedCount = eq.filter(function (x) { return x.bookedBy; }).length;

      var cell = el("div", {
        "data-date": dateStr,
        style: "min-height:96px;min-width:0;overflow:hidden;padding:6px;border-bottom:1px solid var(--border);border-right:1px solid var(--border);cursor:pointer;background:" + (inMonth ? "var(--surface)" : "var(--surface-2)") + ";position:relative;"
      });
      if ((i + 1) % 7 === 0) cell.style.borderRight = "none";
      cell.addEventListener("click", (function (ds) { return function () { state.selectedDate = ds; render(); }; })(dateStr));

      var dNumColor = isToday
        ? "var(--tech)"
        : (weekdayColor(d.getDay()) || (inMonth ? "var(--ink-soft)" : "var(--ink-faint)"));
      var dnum = el("div", { class: "tabular", style: "font-size:12.5px;font-weight:" + (isToday ? "700" : "500") + ";color:" + dNumColor + ";display:flex;align-items:center;gap:5px;margin-bottom:4px;" });
      if (isToday) {
        dnum.appendChild(el("span", { style: "background:var(--tech);color:#fff;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;" }, [String(d.getDate())]));
      } else {
        dnum.appendChild(document.createTextNode(String(d.getDate())));
      }
      cell.appendChild(dnum);

      var chipsWrap = el("div", { style: "display:flex;flex-direction:column;gap:2px;min-width:0;" });
      var CHIP_LIMIT = 9;
      dayEvents.slice(0, CHIP_LIMIT).forEach(function (ev) {
        var isRequest = ev.type === "request";
        var label = (ev.type === "demo" || isRequest) ? (ev.customer || ev.title) : (ev.staff && ev.staff[0] ? ev.staff[0] + " " : "") + ev.title;
        if (isRequest) label = "(リクエスト)" + label;
        var col = eventColor(ev);
        var chipStyle = "font-size:10.8px;padding:2px 5px;border-radius:5px;background:" + col.chipBg + ";color:" + col.chipFg + ";white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;";
        if (isRequest) chipStyle += "border:1px dashed " + col.chipFg + ";background:transparent;";
        chipsWrap.appendChild(el("div", { style: chipStyle }, [label]));
      });
      if (dayEvents.length > CHIP_LIMIT) {
        chipsWrap.appendChild(el("div", { style: "font-size:10.5px;color:var(--ink-faint);padding-left:5px;" }, ["+" + (dayEvents.length - CHIP_LIMIT)]));
      }
      cell.appendChild(chipsWrap);

      if (bookedCount > 0) {
        var eqStrip = el("div", { style: "position:absolute;bottom:5px;right:6px;display:flex;gap:2px;" });
        eq.forEach(function (x) {
          eqStrip.appendChild(el("span", { title: x.name + (x.bookedBy ? ": 使用中" : ": 空き"), style: "width:5px;height:5px;border-radius:50%;background:" + (x.bookedBy ? "var(--bad)" : "var(--good)") + ";display:inline-block;" }));
        });
        cell.appendChild(eqStrip);
      }

      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function renderMemberGrid() {
    var y = state.viewYear, m = state.viewMonth;
    var daysInMonth = new Date(y, m, 0).getDate();
    var today = todayStr();
    var colW = 58, nameW = 104;

    function dayHeaderCell(d) {
      var dateStr = fmtDate(y, m, d);
      var wd = new Date(y, m - 1, d).getDay();
      var isToday = dateStr === today;
      var isWeekend = wd === 0 || wd === 6;
      var wdColor = isToday ? "var(--tech)" : (weekdayColor(wd) || "var(--ink-soft)");
      return el("div", { style: "width:" + colW + "px;flex-shrink:0;text-align:center;padding:5px 2px;border-bottom:1px solid var(--border);border-right:1px solid var(--border);background:" + (isToday ? "var(--tech-bg)" : (isWeekend ? "var(--surface-2)" : "var(--surface)")) + ";" }, [
        el("div", { class: "tabular", style: "font-size:11.5px;font-weight:" + (isToday ? "700" : "500") + ";color:" + wdColor + ";" }, [String(d)]),
        el("div", { style: "font-size:9.5px;color:" + (weekdayColor(wd) || "var(--ink-faint)") + ";" }, [WEEKDAY_JA[wd]])
      ]);
    }

    function rowLabel(label, dotColor) {
      var children = [];
      if (dotColor) children.push(el("span", { style: "width:8px;height:8px;border-radius:50%;background:" + dotColor + ";display:inline-block;flex-shrink:0;" }));
      children.push(el("span", { style: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" }, [label]));
      return el("div", { style: "width:" + nameW + "px;flex-shrink:0;display:flex;align-items:center;gap:6px;padding:6px 8px;font-size:12px;border-bottom:1px solid var(--border);border-right:1px solid var(--border);position:sticky;left:0;background:var(--surface);z-index:1;" }, children);
    }

    function eventCellClick(dateStr, cellEvents, defaultStaff) {
      if (cellEvents.length === 0) { openForm(null, dateStr, defaultStaff); return; }
      if (cellEvents.length === 1) { openForm(cellEvents[0], cellEvents[0].date); return; }
      state.selectedDate = dateStr;
      render();
    }

    var wrap = el("div", { style: "background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow-x:auto;" });
    var table = el("div", { style: "display:inline-block;min-width:100%;" });

    var headRow = el("div", { style: "display:flex;position:sticky;top:0;background:var(--surface);z-index:2;" });
    headRow.appendChild(el("div", { style: "width:" + nameW + "px;flex-shrink:0;padding:6px 8px;font-size:11px;color:var(--ink-faint);border-bottom:1px solid var(--border);border-right:1px solid var(--border);position:sticky;left:0;background:var(--surface);z-index:3;display:flex;align-items:center;" }, ["メンバー"]));
    for (var d = 1; d <= daysInMonth; d++) headRow.appendChild(dayHeaderCell(d));
    table.appendChild(headRow);

    state.staff.forEach(function (mem) {
      var row = el("div", { style: "display:flex;" });
      row.appendChild(rowLabel(mem.name, mem.color));
      for (var d = 1; d <= daysInMonth; d++) {
        var dateStr = fmtDate(y, m, d);
        var isToday = dateStr === today;
        var cellEvents = eventsOnDate(dateStr).filter(function (ev) { return ev.staff && ev.staff.indexOf(mem.name) >= 0; });
        var cell = el("div", { style: "width:" + colW + "px;flex-shrink:0;min-height:36px;padding:2px;border-bottom:1px solid var(--border);border-right:1px solid var(--border);cursor:pointer;background:" + (isToday ? "var(--tech-bg)" : "var(--surface)") + ";" });
        cell.addEventListener("click", (function (ds, evs, name) { return function () { eventCellClick(ds, evs, name); }; })(dateStr, cellEvents, mem.name));
        cellEvents.slice(0, 2).forEach(function (ev) {
          var col = eventColor(ev);
          var label = (ev.type === "demo" || ev.type === "request") ? (ev.customer || ev.title) : ev.title;
          cell.appendChild(el("div", { style: "font-size:9px;line-height:1.3;padding:1px 3px;border-radius:4px;background:" + col.chipBg + ";color:" + col.chipFg + ";white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:1px;" }, [label]));
        });
        if (cellEvents.length > 2) {
          cell.appendChild(el("div", { style: "font-size:8.5px;color:var(--ink-faint);text-align:center;" }, ["+" + (cellEvents.length - 2)]));
        }
        row.appendChild(cell);
      }
      table.appendChild(row);
    });

    if (state.equipment.length) {
      var eqDivider = el("div", { style: "display:flex;" });
      eqDivider.appendChild(el("div", { style: "width:" + nameW + "px;flex-shrink:0;padding:5px 8px;font-size:10.5px;color:var(--ink-faint);border-bottom:1px solid var(--border);border-right:1px solid var(--border);position:sticky;left:0;background:var(--surface-2);" }, ["装置の空き状況"]));
      for (var d2 = 1; d2 <= daysInMonth; d2++) {
        eqDivider.appendChild(el("div", { style: "width:" + colW + "px;flex-shrink:0;border-bottom:1px solid var(--border);border-right:1px solid var(--border);background:var(--surface-2);" }));
      }
      table.appendChild(eqDivider);

      state.equipment.forEach(function (item) {
        var row = el("div", { style: "display:flex;" });
        row.appendChild(rowLabel(item.name, null));
        for (var d = 1; d <= daysInMonth; d++) {
          var dateStr = fmtDate(y, m, d);
          var isToday = dateStr === today;
          var status = equipmentStatusForDate(dateStr).find(function (x) { return x.id === item.id; });
          var busy = status && status.bookedBy;
          var cell = el("div", {
            title: busy ? ("使用中: " + (status.bookedBy.customer || status.bookedBy.title)) : "空き",
            style: "width:" + colW + "px;flex-shrink:0;min-height:28px;display:flex;align-items:center;justify-content:center;border-bottom:1px solid var(--border);border-right:1px solid var(--border);cursor:pointer;background:" + (isToday ? "var(--tech-bg)" : "var(--surface)") + ";"
          });
          cell.addEventListener("click", (function (ds) { return function () { state.selectedDate = ds; render(); }; })(dateStr));
          cell.appendChild(el("span", { style: "width:8px;height:8px;border-radius:50%;background:" + (busy ? "var(--bad)" : "var(--good)") + ";display:inline-block;" }));
          row.appendChild(cell);
        }
        table.appendChild(row);
      });
    }

    var staffNames = state.staff.map(function (mem) { return mem.name; });
    var unassigned = [];
    for (var d3 = 1; d3 <= daysInMonth; d3++) {
      var dateStr3 = fmtDate(y, m, d3);
      eventsOnDate(dateStr3).forEach(function (ev) {
        if (!ev.staff || ev.staff.length === 0 || !ev.staff.some(function (n) { return staffNames.indexOf(n) >= 0; })) {
          unassigned.push({ date: dateStr3, ev: ev });
        }
      });
    }
    if (unassigned.length) {
      var uRow = el("div", { style: "display:flex;" });
      uRow.appendChild(rowLabel("未担当", "var(--ink-faint)"));
      for (var d4 = 1; d4 <= daysInMonth; d4++) {
        var dateStr4 = fmtDate(y, m, d4);
        var isToday4 = dateStr4 === today;
        var cellEvents4 = unassigned.filter(function (u) { return u.date === dateStr4; }).map(function (u) { return u.ev; });
        var cell4 = el("div", { style: "width:" + colW + "px;flex-shrink:0;min-height:36px;padding:2px;border-bottom:1px solid var(--border);border-right:1px solid var(--border);cursor:pointer;background:" + (isToday4 ? "var(--tech-bg)" : "var(--surface)") + ";" });
        cell4.addEventListener("click", (function (ds, evs) { return function () { eventCellClick(ds, evs, null); }; })(dateStr4, cellEvents4));
        cellEvents4.slice(0, 2).forEach(function (ev) {
          var col = eventColor(ev);
          var label = (ev.type === "demo" || ev.type === "request") ? (ev.customer || ev.title) : ev.title;
          cell4.appendChild(el("div", { style: "font-size:9px;line-height:1.3;padding:1px 3px;border-radius:4px;background:" + col.chipBg + ";color:" + col.chipFg + ";white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:1px;" }, [label]));
        });
        uRow.appendChild(cell4);
      }
      table.appendChild(uRow);
    }

    wrap.appendChild(table);
    return wrap;
  }

  function renderRequestList() {
    var wrap = el("div", { style: "display:flex;flex-direction:column;gap:10px;" });
    var requests = state.events.filter(function (e) { return e.type === "request"; }).slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    if (!requests.length) {
      wrap.appendChild(el("div", { style: "background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;text-align:center;color:var(--ink-faint);font-size:13px;" }, ["デモリクエストはまだありません"]));
    } else {
      requests.forEach(function (ev) {
        var candidates = [ev.date, ev.desiredDate2, ev.desiredDate3].filter(Boolean);
        var dateLabel = candidates.map(function (d) {
          var p = parseYMD(d);
          return p.y + "年" + p.m + "月" + p.d + "日";
        }).join(" / ");
        var item = el("div", {});
        item.appendChild(el("div", { style: "font-size:11.5px;color:var(--ink-faint);margin-bottom:4px;font-weight:500;" }, [dateLabel]));
        item.appendChild(renderEventRow(ev));
        wrap.appendChild(item);
      });
    }
    wrap.appendChild(el("button", {
      style: pillBtnStyle(true) + "margin-top:4px;",
      onclick: function () { openForm(null, todayStr(), null, "request"); }
    }, ["+ デモリクエストを追加"]));
    return wrap;
  }

  function shiftMonth(delta) {
    var m = state.viewMonth + delta;
    var y = state.viewYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    state.viewMonth = m; state.viewYear = y;
    render();
  }

  function overlayWrap(children, onBgClick) {
    var bg = el("div", { style: "position:fixed;inset:0;background:rgba(20,24,26,.42);display:flex;align-items:flex-start;justify-content:center;padding:5vh 14px;z-index:50;overflow:auto;" });
    bg.addEventListener("click", function (ev) { if (ev.target === bg && onBgClick) onBgClick(); });
    var panel = el("div", { style: "background:var(--surface);border-radius:14px;border:1px solid var(--border);max-width:560px;width:100%;padding:20px;max-height:90vh;overflow:auto;" }, children);
    panel.addEventListener("click", function (ev) { ev.stopPropagation(); });
    bg.appendChild(panel);
    return bg;
  }

  function renderDayPanel() {
    var dateStr = state.selectedDate;
    var p = parseYMD(dateStr);
    var d = new Date(p.y, p.m - 1, p.d);
    var dayEvents = eventsOnDate(dateStr);
    var eq = equipmentStatusForDate(dateStr);

    var children = [];
    children.push(el("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;" }, [
      el("h2", { style: "font-size:18px;" }, [p.y + "年" + p.m + "月" + p.d + "日(" + WEEKDAY_JA[d.getDay()] + ")"]),
      el("button", { style: iconBtnStyle(), onclick: function () { state.selectedDate = null; render(); } }, ["×"])
    ]));

    var eqRow = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;" });
    eq.forEach(function (x) {
      var busy = !!x.bookedBy;
      eqRow.appendChild(el("div", { style: "font-size:11.5px;padding:4px 8px;border-radius:7px;background:" + (busy ? "var(--bad-bg)" : "var(--good-bg)") + ";color:" + (busy ? "var(--bad)" : "var(--good)") + ";display:flex;align-items:center;gap:5px;", title: busy ? ("使用中: " + (x.bookedBy.customer || x.bookedBy.title)) : "空き" },
        [x.name + (busy ? " ・使用中" : " ・空き")]));
    });
    children.push(eqRow);

    if (dayEvents.length === 0) {
      children.push(el("div", { style: "font-size:13px;color:var(--ink-faint);padding:18px 0;text-align:center;" }, ["この日の予定はまだありません"]));
    } else {
      dayEvents.forEach(function (ev) { children.push(renderEventRow(ev)); });
    }

    children.push(el("button", { style: pillBtnStyle(true) + "width:100%;margin-top:12px;padding:10px;", onclick: function () { openForm(null, dateStr); } }, ["+ この日に予定を追加"]));

    return overlayWrap(children, function () { state.selectedDate = null; render(); });
  }

  function renderEventRow(ev) {
    var isDemo = ev.type === "demo";
    var isRequest = ev.type === "request";
    var showAsCustomer = isDemo || isRequest;
    var col = eventColor(ev);
    var accent = col.fg;
    var row = el("div", { style: "border:1px solid var(--border);border-left:3px solid " + accent + ";border-radius:8px;padding:10px 12px;margin-bottom:8px;background:var(--surface);" + (isRequest ? "border-style:dashed;" : "") });

    var top = el("div", { style: "display:flex;justify-content:space-between;gap:8px;align-items:flex-start;" });
    var titleCol = el("div", { style: "display:flex;flex-direction:column;gap:3px;" });
    var kicker = el("div", { style: "display:flex;align-items:center;gap:6px;font-size:11px;font-weight:500;color:" + accent + ";" }, [isRequest ? "デモリクエスト" : (isDemo ? "デモ" : "技術部")]);
    var cat = categoryById(ev.categoryId);
    if (cat) kicker.appendChild(el("span", { style: "font-size:10.5px;padding:1px 7px;border-radius:9px;background:var(--surface-2);color:var(--ink-soft);font-weight:500;" }, [cat.name]));
    titleCol.appendChild(kicker);
    titleCol.appendChild(el("div", { style: "font-size:13.5px;font-weight:500;" }, [showAsCustomer ? (ev.customer || ev.title) : ev.title]));
    if (isRequest && ev.requesterName) titleCol.appendChild(el("div", { style: "font-size:11.5px;color:var(--ink-soft);" }, ["営業担当: " + ev.requesterName]));
    if (ev.staff && ev.staff.length) titleCol.appendChild(el("div", { style: "font-size:11.5px;color:var(--ink-soft);" }, ["担当: " + ev.staff.join("・")]));
    if (ev.memo && ev.memo !== ev.title) titleCol.appendChild(el("div", { style: "font-size:12px;color:var(--ink-soft);white-space:pre-wrap;" }, [ev.memo]));
    if (showAsCustomer && ev.equipment && ev.equipment.length) {
      var eqNames = ev.equipment.map(function (id) { var f = state.equipment.find(function (x) { return x.id === id; }); return f ? f.name : id; }).join("・");
      titleCol.appendChild(el("div", { style: "font-size:11.5px;color:var(--ink-faint);" }, [(isRequest ? "希望装置: " : "使用装置: ") + eqNames]));
    }
    if (ev.status) titleCol.appendChild(el("span", { style: "font-size:10.5px;padding:2px 7px;border-radius:10px;background:var(--surface-2);color:var(--ink-soft);display:inline-block;width:fit-content;margin-top:2px;" }, [ev.status]));
    if (isDemo && ev.result) titleCol.appendChild(el("div", { style: "font-size:12px;color:var(--good);margin-top:2px;" }, ["結果: " + ev.result]));
    if (isRequest) {
      var candidates = [ev.date, ev.desiredDate2, ev.desiredDate3].filter(Boolean);
      if (candidates.length > 1) titleCol.appendChild(el("div", { style: "font-size:11px;color:var(--ink-faint);" }, ["候補日: " + candidates.join(" / ")]));
    } else if (ev.endDate && ev.endDate !== ev.date) {
      titleCol.appendChild(el("div", { style: "font-size:11px;color:var(--ink-faint);" }, [ev.date + " 〜 " + ev.endDate]));
    }

    var btns = el("div", { style: "display:flex;gap:4px;flex-shrink:0;" });
    if (isRequest) btns.appendChild(el("button", { style: pillBtnStyle(true) + "padding:6px 10px;font-size:11.5px;", onclick: function () { convertRequest(ev); } }, ["予定に変換"]));
    btns.appendChild(el("button", { style: iconBtnStyle() + "font-size:12px;", title: "編集", onclick: function () { openForm(ev, ev.date); } }, ["✎"]));
    btns.appendChild(el("button", { style: iconBtnStyle() + "font-size:12px;color:var(--bad);", title: "削除", onclick: function () { deleteEvent(ev); } }, ["🗑"]));

    top.appendChild(titleCol);
    top.appendChild(btns);
    row.appendChild(top);
    return row;
  }

  // ---- Supabase data layer ----

  function toEventRow(id, data) {
    return {
      id: id,
      type: data.type,
      event_date: data.date,
      end_date: data.endDate || null,
      desired_date_2: data.desiredDate2 || null,
      desired_date_3: data.desiredDate3 || null,
      staff: data.staff || [],
      title: data.title,
      memo: data.memo,
      status: data.status,
      category_id: data.categoryId,
      customer: data.customer,
      equipment: data.equipment || [],
      result: data.result,
      author_name: data.authorName,
      requester_name: data.requesterName,
      updated_at: data.updatedAt,
    };
  }
  function fromEventRow(row) {
    return {
      id: row.id,
      type: row.type,
      date: row.event_date,
      endDate: row.end_date,
      desiredDate2: row.desired_date_2,
      desiredDate3: row.desired_date_3,
      staff: row.staff || [],
      title: row.title,
      memo: row.memo,
      status: row.status,
      categoryId: row.category_id,
      customer: row.customer,
      equipment: row.equipment || [],
      result: row.result,
      authorName: row.author_name,
      requesterName: row.requester_name,
      updatedAt: row.updated_at,
    };
  }

  function fetchEvents() {
    return supabase.from("schedule_events").select("*").order("event_date", { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data || []).map(fromEventRow);
      });
  }
  function fetchConfigValue(key) {
    return supabase.from("schedule_config").select("value").eq("key", key).maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data ? res.data.value : null;
      });
  }
  function writeConfigValue(key, value) {
    return supabase.from("schedule_config").upsert({ key: key, value: value, updated_at: new Date().toISOString() })
      .then(function (res) { if (res.error) throw res.error; });
  }

  function deleteEvent(ev) {
    if (!requireDb()) return;
    showConfirmDialog("この予定を削除します。よろしいですか?", function () {
      supabase.from("schedule_events").delete().eq("id", ev.id).then(function (res) {
        if (res.error) showNotice("削除に失敗しました: " + res.error.message);
      });
    });
  }

  function openForm(ev, defaultDate, defaultStaff, forceType) {
    state.editingEvent = ev;
    var type = forceType || (ev ? ev.type : "tech");
    var typeChanged = ev && forceType && forceType !== ev.type;
    state.formDraft = {
      type: type,
      date: ev ? ev.date : (defaultDate || todayStr()),
      endDate: ev && ev.endDate ? ev.endDate : "",
      desiredDate2: ev && ev.desiredDate2 ? ev.desiredDate2 : "",
      desiredDate3: ev && ev.desiredDate3 ? ev.desiredDate3 : "",
      staff: ev ? (ev.staff || []).slice() : (defaultStaff ? [defaultStaff] : (state.myName ? [state.myName] : [])),
      content: ev ? (ev.memo || "") : "",
      customer: ev ? (ev.customer || "") : "",
      equipment: ev ? (ev.equipment || []).slice() : [],
      result: ev ? (ev.result || "") : "",
      status: (ev && !typeChanged) ? (ev.status || defaultStatusFor(type)) : defaultStatusFor(type),
      categoryId: ev ? (ev.categoryId || null) : null,
      requesterName: ev ? (ev.requesterName || "") : "",
    };
    state.showForm = true;
    render();
  }

  function defaultStatusFor(type) {
    return type === "request" ? "未対応" : "予定";
  }

  function convertRequest(ev) {
    openForm(ev, ev.date, null, "demo");
  }

  function renderFormModal() {
    var ev = state.editingEvent;
    var isEdit = !!ev;
    var draft = state.formDraft;
    var type = draft.type;

    var children = [];
    children.push(el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;" }, [
      el("h2", { style: "font-size:17px;" }, [isEdit ? "予定を編集" : "予定を追加"]),
      el("button", { style: iconBtnStyle(), onclick: closeForm }, ["×"])
    ]));

    var TYPE_LABEL = { tech: "技術部予定", demo: "デモ予定", request: "デモリクエスト" };
    var TYPE_COLOR = { tech: "var(--tech)", demo: "var(--demo)", request: "var(--request)" };
    var TYPE_BG = { tech: "var(--tech-bg)", demo: "var(--demo-bg)", request: "var(--request-bg)" };
    var typeRow = el("div", { style: "display:flex;gap:8px;margin-bottom:14px;" });
    ["tech", "demo", "request"].forEach(function (t) {
      var active = type === t;
      typeRow.appendChild(el("button", {
        type: "button",
        style: "flex:1;padding:9px;border-radius:8px;border:1px solid " + (active ? TYPE_COLOR[t] : "var(--border)") + ";background:" + (active ? TYPE_BG[t] : "var(--surface)") + ";color:" + (active ? TYPE_COLOR[t] : "var(--ink-soft)") + ";font-size:12.5px;font-weight:500;",
        onclick: function () { draft.type = t; draft.status = defaultStatusFor(t); render(); }
      }, [TYPE_LABEL[t]]));
    });
    children.push(typeRow);

    var form = el("form", { id: "psjForm" });

    if (type === "request") {
      var date1Input = el("input", { type: "date", style: inputStyle(), value: draft.date });
      date1Input.addEventListener("input", function () { draft.date = date1Input.value; });
      form.appendChild(formField("第1希望日", date1Input));

      var date2Input = el("input", { type: "date", style: inputStyle(), value: draft.desiredDate2 });
      date2Input.addEventListener("input", function () { draft.desiredDate2 = date2Input.value; });
      form.appendChild(formField("第2希望日(任意)", date2Input));

      var date3Input = el("input", { type: "date", style: inputStyle(), value: draft.desiredDate3 });
      date3Input.addEventListener("input", function () { draft.desiredDate3 = date3Input.value; });
      form.appendChild(formField("第3希望日(任意)", date3Input));
    } else {
      var dateInput = el("input", { type: "date", style: inputStyle(), value: draft.date });
      dateInput.addEventListener("input", function () { draft.date = dateInput.value; });
      form.appendChild(formField("日付", dateInput));

      var endInput = el("input", { type: "date", style: inputStyle(), value: draft.endDate });
      endInput.addEventListener("input", function () { draft.endDate = endInput.value; });
      form.appendChild(formField("終了日(複数日にわたる場合)", endInput));
    }

    if (type === "request") {
      var requesterSelect = el("select", { style: inputStyle() });
      requesterSelect.appendChild(el("option", { value: "" }, ["選択してください"]));
      state.salesStaff.forEach(function (person) {
        var o = el("option", { value: person.name }, [person.name]);
        if (draft.requesterName === person.name) o.selected = true;
        requesterSelect.appendChild(o);
      });
      requesterSelect.addEventListener("change", function () { draft.requesterName = requesterSelect.value; });
      form.appendChild(formField("営業担当者名", requesterSelect));
      if (!state.salesStaff.length) {
        form.appendChild(el("div", { style: "font-size:11.5px;color:var(--ink-faint);margin:-8px 0 12px;" }, ["※ 設定(⚙)から営業担当者を登録してください"]));
      }
    } else {
      var staffBox = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;" });
      state.staff.forEach(function (m) {
        var checked = draft.staff.indexOf(m.name) >= 0;
        var chip = el("label", { style: "display:flex;align-items:center;gap:5px;padding:6px 10px;border-radius:16px;border:1px solid " + (checked ? m.color : "var(--border)") + ";background:" + (checked ? m.color + "26" : "var(--surface)") + ";font-size:12.5px;cursor:pointer;" });
        var cb = el("input", { type: "checkbox", value: m.name, style: "accent-color:" + m.color + ";" });
        cb.checked = checked;
        cb.addEventListener("change", function () {
          var pos = draft.staff.indexOf(m.name);
          if (cb.checked && pos < 0) draft.staff.push(m.name);
          else if (!cb.checked && pos >= 0) draft.staff.splice(pos, 1);
        });
        chip.appendChild(cb);
        chip.appendChild(el("span", { style: "width:7px;height:7px;border-radius:50%;background:" + m.color + ";display:inline-block;" }));
        chip.appendChild(document.createTextNode(m.name));
        staffBox.appendChild(chip);
      });
      form.appendChild(formField("担当者", staffBox));
    }

    var contentInput = el("textarea", { rows: "3", style: inputStyle() + "resize:vertical;" }, [draft.content]);
    contentInput.addEventListener("input", function () { draft.content = contentInput.value; });
    form.appendChild(formField(type === "demo" ? "デモ内容" : (type === "request" ? "リクエスト内容" : "内容"), contentInput));

    var catBox = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;" });
    catBox.appendChild(el("button", {
      type: "button",
      style: "padding:5px 12px;border-radius:16px;border:1px solid " + (!draft.categoryId ? "var(--border-strong)" : "var(--border)") + ";background:" + (!draft.categoryId ? "var(--surface-2)" : "var(--surface)") + ";color:var(--ink-soft);font-size:12.5px;",
      onclick: function () { draft.categoryId = null; render(); }
    }, ["未設定"]));
    state.categories.forEach(function (c) {
      var active = draft.categoryId === c.id;
      catBox.appendChild(el("button", {
        type: "button",
        style: "padding:5px 12px;border-radius:16px;border:1px solid " + (active ? "var(--border-strong)" : "var(--border)") + ";background:" + (active ? "var(--surface-2)" : "var(--surface)") + ";color:" + (active ? "var(--ink)" : "var(--ink-soft)") + ";font-size:12.5px;",
        onclick: function () { draft.categoryId = c.id; render(); }
      }, [c.name]));
    });
    form.appendChild(formField("作業種類(任意)", catBox));

    if (type === "demo" || type === "request") {
      var customerInput = el("input", { type: "text", style: inputStyle(), value: draft.customer, placeholder: "例: 〇〇株式会社" });
      customerInput.addEventListener("input", function () { draft.customer = customerInput.value; });
      form.appendChild(formField("顧客名・案件名", customerInput));

      var eqAccent = type === "request" ? "var(--request)" : "var(--demo)";
      var eqAccentBg = type === "request" ? "var(--request-bg)" : "var(--demo-bg)";
      var eqBox = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;" });
      state.equipment.forEach(function (item) {
        var checked = draft.equipment.indexOf(item.id) >= 0;
        var chip = el("label", { style: "display:flex;align-items:center;gap:5px;padding:6px 10px;border-radius:16px;border:1px solid " + (checked ? eqAccent : "var(--border)") + ";background:" + (checked ? eqAccentBg : "var(--surface)") + ";font-size:12.5px;cursor:pointer;" });
        var cb = el("input", { type: "checkbox", value: item.id, style: "accent-color:" + eqAccent + ";" });
        cb.checked = checked;
        cb.addEventListener("change", function () {
          var pos = draft.equipment.indexOf(item.id);
          if (cb.checked && pos < 0) draft.equipment.push(item.id);
          else if (!cb.checked && pos >= 0) draft.equipment.splice(pos, 1);
        });
        chip.appendChild(cb);
        chip.appendChild(document.createTextNode(item.name));
        eqBox.appendChild(chip);
      });
      form.appendChild(formField(type === "request" ? "希望装置" : "使用装置", eqBox));

      if (type === "demo") {
        var resultInput = el("textarea", { rows: "2", style: inputStyle() + "resize:vertical;" }, [draft.result]);
        resultInput.addEventListener("input", function () { draft.result = resultInput.value; });
        form.appendChild(formField("結果・メモ", resultInput));
      }
    }

    var STATUS_OPTIONS = type === "request" ? ["未対応", "調整中", "確定", "却下"] : ["予定", "確定", "完了", "キャンセル"];
    var statusSel = el("select", { style: inputStyle() });
    STATUS_OPTIONS.forEach(function (s) {
      var o = el("option", { value: s }, [s]);
      if (draft.status === s) o.selected = true;
      statusSel.appendChild(o);
    });
    statusSel.addEventListener("change", function () { draft.status = statusSel.value; });
    form.appendChild(formField("ステータス", statusSel));

    children.push(form);

    var actions = el("div", { style: "display:flex;gap:8px;margin-top:16px;" });
    if (isEdit) actions.appendChild(el("button", { type: "button", style: pillBtnStyle(false) + "color:var(--bad);border-color:var(--bad);", onclick: function () { closeForm(); deleteEvent(ev); } }, ["削除"]));
    actions.appendChild(el("div", { style: "flex:1;" }));
    actions.appendChild(el("button", { type: "button", style: pillBtnStyle(false), onclick: closeForm }, ["キャンセル"]));
    actions.appendChild(el("button", { type: "button", style: pillBtnStyle(true), onclick: function () { saveForm(ev); } }, ["保存"]));
    children.push(actions);

    return overlayWrap(children, closeForm);
  }

  function formField(label, inputEl) {
    return el("div", { style: "margin-bottom:12px;" }, [
      el("div", { style: "font-size:12px;color:var(--ink-soft);margin-bottom:5px;" }, [label]),
      inputEl
    ]);
  }

  function closeForm() {
    state.showForm = false;
    state.editingEvent = null;
    if (state._pendingEvents) { state.events = state._pendingEvents; state._pendingEvents = null; }
    render();
  }

  function saveForm(existingEv) {
    if (!requireDb()) return;
    var draft = state.formDraft;
    var date = draft.date;
    if (!date) { showNotice("日付を入力してください"); return; }
    var endDate = draft.endDate || null;
    var content = draft.content.trim();
    var type = draft.type;

    if (type === "request") {
      if (!draft.requesterName) { showNotice("営業担当者名を選択してください"); return; }
      if (!draft.customer.trim()) { showNotice("顧客名を入力してください"); return; }
      if (!draft.equipment.length) { showNotice("希望装置を選択してください"); return; }
    } else if (!content) {
      showNotice("内容を入力してください"); return;
    }

    var data = {
      type: type,
      date: date,
      endDate: type === "request" ? null : endDate,
      desiredDate2: type === "request" ? (draft.desiredDate2 || null) : null,
      desiredDate3: type === "request" ? (draft.desiredDate3 || null) : null,
      staff: draft.staff.slice(),
      title: content.slice(0, 40),
      memo: content,
      status: draft.status,
      categoryId: draft.categoryId || null,
      authorName: state.myName || (existingEv ? existingEv.authorName : "") || "",
      requesterName: type === "request" ? draft.requesterName.trim() : null,
      updatedAt: new Date().toISOString(),
    };

    function writeEvent() {
      var id = existingEv ? existingEv.id : crypto.randomUUID();
      supabase.from("schedule_events").upsert(toEventRow(id, data)).then(function (res) {
        if (res.error) { showNotice("保存に失敗しました: " + res.error.message); return; }
        closeForm();
      });
    }

    if (type === "demo") {
      data.customer = draft.customer.trim();
      data.equipment = draft.equipment.slice();
      data.result = draft.result.trim();

      var newEnd = endDate || date;
      var conflict = state.events.find(function (e) {
        if (e.type !== "demo" || (existingEv && e.id === existingEv.id)) return false;
        var end = e.endDate || e.date;
        var overlap = date <= end && newEnd >= e.date;
        if (!overlap) return false;
        return (e.equipment || []).some(function (id) { return data.equipment.indexOf(id) >= 0; });
      });
      if (conflict) {
        showConfirmDialog("選択した装置は既に「" + (conflict.customer || conflict.title) + "」で予約されています。このまま保存しますか?", writeEvent);
        return;
      }
    } else if (type === "request") {
      data.customer = draft.customer.trim();
      data.equipment = draft.equipment.slice();
      data.result = null;
    } else {
      data.customer = null; data.equipment = []; data.result = null;
    }

    writeEvent();
  }

  function noop() {}
  function moveButtons(idx, len, onMove) {
    var wrap = el("div", { style: "display:flex;flex-direction:column;gap:1px;" });
    wrap.appendChild(el("button", {
      type: "button", title: "上へ",
      style: "width:22px;height:18px;border-radius:4px 4px 0 0;border:1px solid var(--border);background:var(--surface);color:var(--ink-soft);font-size:10px;line-height:1;padding:0;" + (idx === 0 ? "opacity:.35;cursor:default;" : ""),
      onclick: idx === 0 ? noop : function () { onMove(idx, idx - 1); }
    }, ["▲"]));
    wrap.appendChild(el("button", {
      type: "button", title: "下へ",
      style: "width:22px;height:18px;border-radius:0 0 4px 4px;border:1px solid var(--border);border-top:none;background:var(--surface);color:var(--ink-soft);font-size:10px;line-height:1;padding:0;" + (idx === len - 1 ? "opacity:.35;cursor:default;" : ""),
      onclick: idx === len - 1 ? noop : function () { onMove(idx, idx + 1); }
    }, ["▼"]));
    return wrap;
  }

  function attachDragHandle(handle, row, container) {
    var dragging = false;
    var startY = 0;
    var pointerId = null;
    handle.style.touchAction = "none";
    handle.style.cursor = "grab";

    function onMove(e) {
      if (!dragging) return;
      var y = e.clientY;
      row.style.transform = "translateY(" + (y - startY) + "px)";
      var prev = row.previousElementSibling;
      if (prev) {
        var pr = prev.getBoundingClientRect();
        if (y < pr.top + pr.height * 0.5) {
          container.insertBefore(row, prev);
          startY = y;
          row.style.transform = "translateY(0px)";
          return;
        }
      }
      var next = row.nextElementSibling;
      if (next) {
        var nr = next.getBoundingClientRect();
        if (y > nr.top + nr.height * 0.5) {
          container.insertBefore(row, next.nextSibling);
          startY = y;
          row.style.transform = "translateY(0px)";
          return;
        }
      }
    }

    function finish() {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      try { handle.releasePointerCapture(pointerId); } catch (err) {}
      row.style.transform = ""; row.style.zIndex = ""; row.style.boxShadow = "";
      row.style.position = ""; row.style.background = ""; row.style.borderRadius = "";
      var newOrder = Array.prototype.map.call(container.children, function (el) { return el.dataset.staffName; });
      saveStaffOrder(newOrder);
    }

    handle.addEventListener("pointerdown", function (e) {
      dragging = true;
      pointerId = e.pointerId;
      startY = e.clientY;
      try { handle.setPointerCapture(pointerId); } catch (err) {}
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", finish);
      document.addEventListener("pointercancel", finish);
      row.style.position = "relative"; row.style.zIndex = "10";
      row.style.boxShadow = "0 6px 16px rgba(0,0,0,.18)"; row.style.background = "var(--surface)";
      row.style.borderRadius = "8px";
      e.preventDefault();
    });
  }

  function saveStaffOrder(newOrderNames) {
    var byName = {};
    state.staff.forEach(function (m) { byName[m.name] = m; });
    var reordered = newOrderNames.map(function (n) { return byName[n]; }).filter(Boolean);
    state.staff.forEach(function (m) { if (reordered.indexOf(m) === -1) reordered.push(m); });
    state.staff = reordered;
    saveStaffConfig();
    render();
  }

  function colorSwatchGrid(currentColor, onPick) {
    var grid = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);margin-top:6px;max-width:220px;" });
    PALETTE.forEach(function (c) {
      var active = c.toLowerCase() === (currentColor || "").toLowerCase();
      grid.appendChild(el("button", {
        type: "button", title: c,
        style: "width:20px;height:20px;border-radius:50%;background:" + c + ";border:2px solid " + (active ? "var(--ink)" : "transparent") + ";box-shadow:0 0 0 1px var(--border);",
        onclick: function () { onPick(c); }
      }));
    });
    return grid;
  }

  function renderSettingsModal() {
    var children = [];
    children.push(el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;" }, [
      el("h2", { style: "font-size:17px;" }, ["スタッフ・装置・作業種類の設定"]),
      el("button", { style: iconBtnStyle(), onclick: closeSettings }, ["×"])
    ]));

    children.push(el("div", { style: "font-size:12px;color:var(--ink-soft);margin-bottom:6px;" }, ["メンバー(⠿をドラッグ、または▲▼で並べ替え。色の丸をクリックで色を変更。変更は自動保存されます)"]));
    var staffList = el("div", { style: "display:flex;flex-direction:column;gap:6px;margin-bottom:16px;" });
    state.staff.forEach(function (m, idx) {
      var row = el("div", { style: "display:flex;flex-direction:column;" });
      row.dataset.staffName = m.name;
      var line = el("div", { style: "display:flex;gap:6px;align-items:center;" });
      line.appendChild(moveButtons(idx, state.staff.length, function (from, to) {
        var moved = state.staff.splice(from, 1)[0];
        state.staff.splice(to, 0, moved);
        saveStaffConfig();
        render();
      }));
      var handle = el("span", { title: "ドラッグで並べ替え", style: "cursor:grab;color:var(--ink-faint);font-size:20px;line-height:1;padding:8px;margin:-8px;user-select:none;flex-shrink:0;touch-action:none;" }, ["⠿"]);
      attachDragHandle(handle, row, staffList);
      line.appendChild(handle);
      var popover = colorSwatchGrid(m.color, function (c) { state.staff[idx].color = c; saveStaffConfig(); render(); });
      popover.style.display = "none";
      var dot = el("button", {
        type: "button", title: "色を変更",
        style: "width:20px;height:20px;border-radius:50%;background:" + m.color + ";border:1px solid var(--border-strong);flex-shrink:0;",
        onclick: function () { popover.style.display = (popover.style.display === "none") ? "flex" : "none"; }
      });
      var input = el("input", { type: "text", value: m.name, style: inputStyle() });
      input.addEventListener("change", function () { state.staff[idx].name = input.value.trim() || m.name; saveStaffConfig(); });
      var del = el("button", { type: "button", style: iconBtnStyle(), onclick: function () { state.staff.splice(idx, 1); saveStaffConfig(); render(); } }, ["×"]);
      line.appendChild(dot); line.appendChild(input); line.appendChild(del);
      row.appendChild(line);
      row.appendChild(popover);
      staffList.appendChild(row);
    });
    children.push(staffList);
    children.push(el("button", {
      type: "button", style: pillBtnStyle(false), onclick: function () {
        state.staff.push({ name: "新しいメンバー", color: PALETTE[state.staff.length % PALETTE.length] });
        saveStaffConfig(); render();
      }
    }, ["+ メンバーを追加"]));

    children.push(el("div", { style: "height:1px;background:var(--border);margin:18px 0;" }));

    children.push(el("div", { style: "font-size:12px;color:var(--ink-soft);margin-bottom:6px;" }, ["装置一覧(デモ予約で使用装置を選ぶ際の選択肢です。変更は自動保存されます)"]));
    var eqList = el("div", { style: "display:flex;flex-direction:column;gap:6px;margin-bottom:16px;" });
    state.equipment.forEach(function (item, idx) {
      var row = el("div", { style: "display:flex;gap:6px;" });
      var input = el("input", { type: "text", value: item.name, style: inputStyle() });
      input.addEventListener("change", function () { state.equipment[idx].name = input.value.trim() || item.name; saveEquipmentConfig(); });
      var del = el("button", { type: "button", style: iconBtnStyle(), onclick: function () { state.equipment.splice(idx, 1); saveEquipmentConfig(); render(); } }, ["×"]);
      row.appendChild(input); row.appendChild(del);
      eqList.appendChild(row);
    });
    children.push(eqList);
    children.push(el("button", {
      type: "button", style: pillBtnStyle(false), onclick: function () {
        state.equipment.push({ id: "eq_" + Date.now(), name: "新しい装置" });
        saveEquipmentConfig(); render();
      }
    }, ["+ 装置を追加"]));

    children.push(el("div", { style: "height:1px;background:var(--border);margin:18px 0;" }));

    children.push(el("div", { style: "font-size:13px;font-weight:500;margin-bottom:2px;" }, ["作業種類の管理"]));
    children.push(el("div", { style: "font-size:12px;color:var(--ink-soft);margin-bottom:8px;" }, ["予定に付けられるタグです。変更は自動保存されます"]));
    var catList = el("div", { style: "display:flex;flex-direction:column;gap:6px;margin-bottom:16px;" });
    state.categories.forEach(function (cat, idx) {
      var row = el("div", { style: "display:flex;gap:6px;" });
      var input = el("input", { type: "text", value: cat.name, style: inputStyle() });
      input.addEventListener("change", function () { state.categories[idx].name = input.value.trim() || cat.name; saveCategoriesConfig(); });
      var del = el("button", { type: "button", style: iconBtnStyle(), onclick: function () { state.categories.splice(idx, 1); saveCategoriesConfig(); render(); } }, ["×"]);
      row.appendChild(input); row.appendChild(del);
      catList.appendChild(row);
    });
    children.push(catList);
    children.push(el("button", {
      type: "button", style: pillBtnStyle(false), onclick: function () {
        state.categories.push({ id: "cat_" + Date.now(), name: "新しい種類" });
        saveCategoriesConfig(); render();
      }
    }, ["+ 作業種類を追加"]));

    children.push(el("div", { style: "height:1px;background:var(--border);margin:18px 0;" }));

    children.push(el("div", { style: "font-size:13px;font-weight:500;margin-bottom:2px;" }, ["営業担当者一覧"]));
    children.push(el("div", { style: "font-size:12px;color:var(--ink-soft);margin-bottom:8px;" }, ["デモリクエスト登録時のプルダウンに表示されます。変更は自動保存されます"]));
    var salesList = el("div", { style: "display:flex;flex-direction:column;gap:6px;margin-bottom:16px;" });
    state.salesStaff.forEach(function (person, idx) {
      var row = el("div", { style: "display:flex;gap:6px;" });
      var input = el("input", { type: "text", value: person.name, style: inputStyle() });
      input.addEventListener("change", function () { state.salesStaff[idx].name = input.value.trim() || person.name; saveSalesStaffConfig(); });
      var del = el("button", { type: "button", style: iconBtnStyle(), onclick: function () { state.salesStaff.splice(idx, 1); saveSalesStaffConfig(); render(); } }, ["×"]);
      row.appendChild(input); row.appendChild(del);
      salesList.appendChild(row);
    });
    children.push(salesList);
    children.push(el("button", {
      type: "button", style: pillBtnStyle(false), onclick: function () {
        state.salesStaff.push({ id: "sales_" + Date.now(), name: "新しい担当者" });
        saveSalesStaffConfig(); render();
      }
    }, ["+ 営業担当者を追加"]));

    var actions = el("div", { style: "display:flex;gap:8px;margin-top:20px;" });
    actions.appendChild(el("div", { style: "flex:1;" }));
    actions.appendChild(el("button", { type: "button", style: pillBtnStyle(true), onclick: closeSettings }, ["閉じる"]));
    children.push(actions);

    return overlayWrap(children, closeSettings);
  }

  function closeSettings() {
    state.showSettings = false;
    state._pendingStaff = null;
    state._pendingEquipment = null;
    state._pendingCategories = null;
    state._pendingSalesStaff = null;
    render();
  }

  function saveStaffConfig() {
    if (!requireDb()) return;
    writeConfigValue("staff", { members: state.staff }).catch(function (e) { showNotice("スタッフ一覧の保存に失敗しました: " + e.message); });
  }
  function saveEquipmentConfig() {
    if (!requireDb()) return;
    writeConfigValue("equipment", { items: state.equipment }).catch(function (e) { showNotice("装置一覧の保存に失敗しました: " + e.message); });
  }
  function saveCategoriesConfig() {
    if (!requireDb()) return;
    writeConfigValue("categories", { items: state.categories }).catch(function (e) { showNotice("作業種類の保存に失敗しました: " + e.message); });
  }
  function saveSalesStaffConfig() {
    if (!requireDb()) return;
    writeConfigValue("salesStaff", { items: state.salesStaff }).catch(function (e) { showNotice("営業担当者一覧の保存に失敗しました: " + e.message); });
  }

  function modalOpen() { return state.showForm || state.showSettings; }

  function subscribeTable(table, onChange) {
    var attempt = 0;
    var channel = null;
    function connect() {
      channel = supabase.channel("sched-" + table + "-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: table }, function () { onChange(); })
        .subscribe(function (status) {
          if (status === "SUBSCRIBED") {
            attempt = 0;
            if (state.syncStale) { state.syncStale = false; render(); }
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            attempt++;
            state.syncStale = true;
            render();
            setTimeout(function () { try { supabase.removeChannel(channel); } catch (e) {} connect(); }, Math.min(2000 * attempt, 15000));
          }
        });
    }
    connect();
  }

  function boot() {
    state.dbReady = false;
    render();
    Promise.all([
      fetchConfigValue("staff"),
      fetchConfigValue("equipment"),
      fetchConfigValue("categories"),
      fetchConfigValue("salesStaff"),
      fetchEvents(),
    ]).then(function (results) {
      state.staff = (results[0] && results[0].members) || [];
      state.equipment = (results[1] && results[1].items) || [];
      state.categories = (results[2] && results[2].items) || [];
      state.salesStaff = (results[3] && results[3].items) || [];
      state.events = results[4];
      state.db = true;
      state.dbReady = true;
      render();
    }).catch(function (e) {
      console.error("initial load failed", e);
      state.db = false;
      state.dbReady = true;
      render();
    });

    subscribeTable("schedule_events", function () {
      fetchEvents().then(function (events) {
        if (state.showForm) state._pendingEvents = events;
        else { state.events = events; if (!modalOpen()) render(); }
      }).catch(function (e) { console.error(e); });
    });

    subscribeTable("schedule_config", function () {
      Promise.all([fetchConfigValue("staff"), fetchConfigValue("equipment"), fetchConfigValue("categories"), fetchConfigValue("salesStaff")])
        .then(function (results) {
          var members = results[0] && results[0].members;
          var items = results[1] && results[1].items;
          var cats = results[2] && results[2].items;
          var sales = results[3] && results[3].items;
          if (state.showSettings) {
            if (members) state._pendingStaff = members;
            if (items) state._pendingEquipment = items;
            if (cats) state._pendingCategories = cats;
            if (sales) state._pendingSalesStaff = sales;
          } else {
            if (members) state.staff = members;
            if (items) state.equipment = items;
            if (cats) state.categories = cats;
            if (sales) state.salesStaff = sales;
          }
          if (!modalOpen()) render();
        }).catch(function (e) { console.error(e); });
    });
  }

  // ---- Passcode gate ----
  function tryUnlock(code) {
    if (code === config.passcode) {
      try { localStorage.setItem(PASS_KEY, code); } catch (_) {}
      lockScreen.hidden = true;
      appRoot.hidden = false;
      boot();
      return true;
    }
    return false;
  }

  var storedPass = null;
  try { storedPass = localStorage.getItem(PASS_KEY); } catch (_) { storedPass = null; }

  if (!(storedPass && tryUnlock(storedPass))) {
    lockScreen.hidden = false;
    lockInput.focus();
    lockForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!tryUnlock(lockInput.value)) {
        lockError.hidden = false;
        lockInput.select();
      }
    });
  }
})();
