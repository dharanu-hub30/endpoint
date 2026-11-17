(function () {
  "use strict";

  /* ---------- Simulated back end (stands in for Cloud Run + Firestore) ---------- */
  var db = [
    { id: "WT-101", district: "Harbour Front", status: "online", kw: 850 },
    { id: "WT-102", district: "Tech Park", status: "online", kw: 420 },
    { id: "WT-103", district: "Green Belt", status: "maintenance", kw: 1500 }
  ];
  var nextId = 104;
  var STATUS_CYCLE = ["online", "maintenance", "offline"];
  var DISTRICTS = ["Harbour Front", "Tech Park", "Old Town", "Green Belt"];

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Each handler returns { status, data }. Errors use HTTP-style codes.
  function serverHandle(method, path, body) {
    var m;
    if (method === "GET" && path === "/turbines") {
      return { status: 200, data: db.map(function (t) { return Object.assign({}, t); }) };
    }
    if (method === "POST" && path === "/turbines") {
      var kw = Number(body && body.kw);
      if (!body || DISTRICTS.indexOf(body.district) === -1) return { status: 400, data: { error: "district is required" } };
      if (isNaN(kw) || kw < 100 || kw > 3000) return { status: 400, data: { error: "kw must be between 100 and 3000" } };
      var created = { id: "WT-" + nextId++, district: body.district, status: "online", kw: Math.round(kw) };
      db.push(created);
      return { status: 201, data: created };
    }
    m = path.match(/^\/turbines\/(WT-\d+)$/);
    if (m) {
      var idx = db.findIndex(function (t) { return t.id === m[1]; });
      if (idx === -1) return { status: 404, data: { error: "turbine not found" } };
      if (method === "PUT") {
        if (STATUS_CYCLE.indexOf(body && body.status) === -1) return { status: 400, data: { error: "invalid status" } };
        db[idx].status = body.status;
        return { status: 200, data: Object.assign({}, db[idx]) };
      }
      if (method === "DELETE") {
        db.splice(idx, 1);
        return { status: 204, data: null };
      }
    }
    return { status: 405, data: { error: "method not allowed" } };
  }

  /* ---------- Diagram animation ---------- */
  var ROUTE_STATIC = ["n-device", "eA", "n-cdn", "eB", "n-lb", "eF", "n-storage"];
  var ROUTE_API = ["n-device", "eA", "n-cdn", "eB", "n-lb", "eC", "n-run", "eE", "n-secret", "eD", "n-fs"];

  function el(id) { return document.getElementById("epw-" + id); }

  function clearDiagram() {
    var all = document.querySelectorAll("#epw-diagram .epw-on, #epw-diagram .epw-fail");
    Array.prototype.forEach.call(all, function (n) { n.classList.remove("epw-on", "epw-fail"); });
  }

  async function playRoute(route, failAt) {
    clearDiagram();
    for (var i = 0; i < route.length; i++) {
      var node = el(route[i]);
      if (failAt !== undefined && i === failAt) {
        node.classList.add("epw-fail");
        break;
      }
      node.classList.add("epw-on");
      await sleep(150);
    }
  }

  /* ---------- Client: async request helper ---------- */
  var stats = { total: 0, ok: 0, err: 0, ms: 0 };
  var outageBox = document.getElementById("epw-outage");
  var banner = document.getElementById("epw-banner");
  var logList = document.getElementById("epw-log");
  var logStarted = false;
  var busy = false;

  function logLine(text, cls) {
    if (!logStarted) { logList.innerHTML = ""; logStarted = true; }
    var li = document.createElement("li");
    li.className = cls;
    var t = new Date();
    li.textContent = "[" + t.toLocaleTimeString("en-GB") + "] " + text;
    logList.appendChild(li);
    logList.scrollTop = logList.scrollHeight;
    while (logList.children.length > 40) logList.removeChild(logList.firstChild);
  }

  function updateStats() {
    document.getElementById("epw-s-total").textContent = stats.total;
    document.getElementById("epw-s-ok").textContent = stats.ok;
    document.getElementById("epw-s-err").textContent = stats.err;
    document.getElementById("epw-s-ms").textContent = stats.total ? Math.round(stats.ms / stats.total) + " ms" : "0 ms";
    var kw = db.reduce(function (sum, t) { return sum + (t.status === "online" ? t.kw : 0); }, 0);
    document.getElementById("epw-s-kw").textContent = kw.toLocaleString("en-IN") + " kW";
  }

  function setBusy(flag) {
    busy = flag;
    var controls = document.querySelectorAll("#epw-run-static, #epw-run-api, #epw-refresh, #epw-form .epw-btn, .epw-mini");
    Array.prototype.forEach.call(controls, function (c) { c.disabled = flag; });
  }

  // Sends a request through the "architecture", waits for the response, and throws on HTTP errors.
  async function request(method, path, body) {
    var started = performance.now();
    var label = method + " " + path;
    banner.hidden = true;
    setBusy(true);
    stats.total++;
    try {
      if (outageBox.checked) {
        // Request reaches the load balancer, but the back end is unreachable.
        await playRoute(ROUTE_API, 6); // stops and turns Cloud Run red
        await sleep(300);
        throw { status: 503, message: "service unavailable" };
      }

      var playing = playRoute(ROUTE_API);
      await sleep(120 + Math.random() * 200); // network + server time
      var res = serverHandle(method, path, body);
      await playing;

      if (res.status >= 400) throw { status: res.status, message: res.data.error };

      var ms = Math.round(performance.now() - started);
      stats.ok++;
      stats.ms += ms;
      logLine(label + " -> " + res.status + " (" + ms + " ms)", "epw-ok");
      return res.data;
    } catch (err) {
      var ms2 = Math.round(performance.now() - started);
      stats.err++;
      stats.ms += ms2;
      var status = err && err.status ? err.status : 500;
      var message = err && err.message ? err.message : "unknown error";
      logLine(label + " -> " + status + " " + message + " (" + ms2 + " ms)", "epw-bad");
      banner.textContent = "Request failed: " + status + " " + message;
      banner.hidden = false;
      throw err;
    } finally {
      setTimeout(clearDiagram, 600);
      setBusy(false);
      updateStats();
    }
  }

  /* ---------- Render the table ---------- */
  var tbody = document.getElementById("epw-rows");

  function render(list) {
    tbody.innerHTML = "";
    if (!list.length) {
      var tr0 = document.createElement("tr");
      var td0 = document.createElement("td");
      td0.colSpan = 5; td0.className = "epw-empty"; td0.textContent = "No turbines in the fleet.";
      tr0.appendChild(td0); tbody.appendChild(tr0);
      return;
    }
    list.forEach(function (t) {
      var tr = document.createElement("tr");

      [t.id, t.district].forEach(function (txt) {
        var td = document.createElement("td"); td.textContent = txt; tr.appendChild(td);
      });

      var tdS = document.createElement("td");
      var badge = document.createElement("span");
      badge.className = "epw-status epw-st-" + t.status;
      badge.textContent = t.status;
      tdS.appendChild(badge); tr.appendChild(tdS);

      var tdK = document.createElement("td"); tdK.textContent = t.kw; tr.appendChild(tdK);

      var tdA = document.createElement("td");
      var toggle = document.createElement("button");
      toggle.type = "button"; toggle.className = "epw-mini"; toggle.textContent = "PUT status";
      toggle.addEventListener("click", function () { changeStatus(t); });
      var del = document.createElement("button");
      del.type = "button"; del.className = "epw-mini epw-del"; del.textContent = "DELETE";
      del.addEventListener("click", function () { removeTurbine(t); });
      tdA.appendChild(toggle); tdA.appendChild(del); tr.appendChild(tdA);

      tbody.appendChild(tr);
    });
  }

  /* ---------- Actions ---------- */
  async function loadFleet() {
    try {
      var list = await request("GET", "/turbines");
      render(list);
    } catch (e) { /* error already shown in the banner and log */ }
  }

  async function changeStatus(t) {
    var next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(t.status) + 1) % STATUS_CYCLE.length];
    try {
      await request("PUT", "/turbines/" + t.id, { status: next });
      render(await request("GET", "/turbines"));
    } catch (e) { /* handled in request() */ }
  }

  async function removeTurbine(t) {
    try {
      await request("DELETE", "/turbines/" + t.id);
      render(await request("GET", "/turbines"));
    } catch (e) { /* handled in request() */ }
  }

  document.getElementById("epw-refresh").addEventListener("click", loadFleet);

  document.getElementById("epw-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var districtEl = document.getElementById("epw-district");
    var kwEl = document.getElementById("epw-kw");
    try {
      await request("POST", "/turbines", { district: districtEl.value, kw: kwEl.value });
      districtEl.value = "";
      kwEl.value = "";
      render(await request("GET", "/turbines"));
    } catch (err) { /* handled in request() */ }
  });

  /* ---------- Diagram demo buttons ---------- */
  document.getElementById("epw-run-static").addEventListener("click", async function () {
    if (busy) return;
    setBusy(true);
    await playRoute(ROUTE_STATIC);
    logLine("GET /index.html -> 200 from Cloud Storage via CDN", "epw-ok");
    await sleep(700);
    clearDiagram();
    setBusy(false);
  });

  document.getElementById("epw-run-api").addEventListener("click", function () {
    if (!busy) loadFleet();
  });

  outageBox.addEventListener("change", function () {
    logLine("Outage simulation " + (outageBox.checked ? "ON: requests will return 503" : "OFF"), outageBox.checked ? "epw-bad" : "epw-dim");
  });

  /* ---------- Start ---------- */
  render(db);
  updateStats();
  loadFleet();
})();
