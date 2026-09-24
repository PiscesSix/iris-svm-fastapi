// Model arena (highlight feature): move the sliders and the five regression models
// answer side by side in real time, compared with their consensus (median).
import { dbApi, modelApi } from "../api.js";
import { getAuth } from "../auth.js";
import { chart } from "../charts.js";
import { icon } from "../icons.js";
import {
  cap, debounce, duration, errorState, esc, FEATURE_SHORT, MODEL_COLORS, MODEL_KEYS, MODEL_SHORT, num, onClick,
  signed, skeleton, SPECIES_KEYS, speedBadge, toast,
} from "../ui.js";

const INPUTS = ["sepal_length", "sepal_width", "petal_length"];
const DEBOUNCE_MS = 250;

function slider(feature, range, value) {
  return `
    <div class="slider">
      <div class="slider-head"><label for="sl-${feature}">${esc(FEATURE_SHORT[feature])}</label><b id="val-${feature}">${num(value, 1)} cm</b></div>
      <input type="range" id="sl-${feature}" data-feature="${feature}" min="${range.min}" max="${range.max}" step="0.1" value="${value}">
      <div class="slider-foot"><span>${num(range.min, 1)}</span><span>min–max trong dữ liệu</span><span>${num(range.max, 1)}</span></div>
    </div>`;
}

function modelCard(r, outlierKey) {
  const outlier = r.model === outlierKey;
  return `
    <div class="model-card${outlier ? " outlier" : ""}">
      ${outlier ? `<span class="flag">Lệch nhiều nhất</span>` : ""}
      <div class="name"><span class="swatch" style="background:${MODEL_COLORS[r.model]}"></span>${esc(r.label)}</div>
      <div class="value">${num(r.prediction, 3)} <small>cm</small></div>
      <div class="dev">Lệch đồng thuận: <b>${signed(r.deviation, 3)}</b> cm</div>
      <div class="dev">${duration(r.runtime_ms)} ${speedBadge(r.speed)}</div>
    </div>`;
}

export default {
  title: "Đấu trường mô hình",
  subtitle: "Kéo thanh trượt — 5 mô hình hồi quy dự đoán petal_width cùng lúc và so với giá trị đồng thuận",
  icon: "swords",

  async render(view, ctx) {
    view.innerHTML = `<div class="grid cols-2"><div class="card">${skeleton({ lines: 8 })}</div><div class="card">${skeleton({ block: true, lines: 2 })}</div></div>`;
    let summary;
    try {
      summary = await modelApi("/dataset/summary");
    } catch (err) {
      if (!ctx.alive()) return;
      view.innerHTML = `<div class="card">${errorState(err.message, "retry")}</div>`;
      onClick(view, "#retry", () => this.render(view, ctx));
      return;
    }
    if (!ctx.alive()) return;

    // Slider bounds = the real min/max of each measurement over the whole dataset.
    const ranges = Object.fromEntries(INPUTS.map(f => [f, {
      min: Math.min(...summary.species.map(s => s.stats[f].min)),
      max: Math.max(...summary.species.map(s => s.stats[f].max)),
    }]));
    const meansOf = sp => {
      const s = summary.species.find(x => x.species === sp);
      return Object.fromEntries(INPUTS.map(f => [f, Math.round(s.stats[f].mean * 10) / 10]));
    };
    const input = { ...meansOf(ctx.species), species: ctx.species };
    const actualMean = summary.species.find(x => x.species === ctx.species).stats.petal_width.mean;

    view.innerHTML = `
      <div class="stack">
        <section class="card tinted highlight-banner">
          ${icon("sparkles", 22)}
          <div><h2>Điểm nổi bật · Đấu trường mô hình</h2>
            <p>Mỗi lần bạn kéo thanh trượt, web chờ ${DEBOUNCE_MS} ms (debounce) rồi gọi <code>POST /regression/arena</code>:
              cả 5 mô hình dự đoán trên cùng đầu vào, API tính <b>giá trị đồng thuận</b> (trung vị 5 dự đoán), độ lệch của từng mô hình
              và chỉ ra mô hình <b>lệch nhiều nhất</b>. Thời gian chạy đo bằng <code>time.perf_counter</code> (trung vị 5 lần gọi).</p></div>
        </section>

        <div class="grid arena-layout">
          <section class="card">
            <div class="card-head"><h2>Đầu vào</h2><button class="btn ghost small" id="reset" type="button">${icon("refresh-cw", 14)}Về trung bình loài</button></div>
            <div class="stack" style="gap:16px">
              ${INPUTS.map(f => slider(f, ranges[f], input[f])).join("")}
              <div>
                <div class="kv-label" style="margin-bottom:6px">Loài hoa (one-hot)</div>
                <div class="segmented" id="speciesSeg">
                  ${SPECIES_KEYS.map(s => `<button type="button" data-sp="${s}" class="${s === input.species ? "active" : ""}">${cap(s)}</button>`).join("")}
                </div>
              </div>
              <p class="caption">Giá trị mặc định = trung bình thật của loài ${cap(ctx.species)} trong dữ liệu;
                petal_width trung bình của loài này là <b>${num(actualMean, 3)} cm</b>.</p>
            </div>
          </section>

          <div class="stack">
            <section class="card">
              <div class="consensus" id="consensus">${skeleton({ lines: 2 })}</div>
            </section>
            <section class="card">
              <div class="card-head"><div><h2>5 mô hình song song</h2><p class="sub" id="latency">Đang gọi API…</p></div></div>
              <div class="arena-grid" id="cards">${Array(5).fill(`<div class="model-card">${skeleton({ lines: 3 })}</div>`).join("")}</div>
            </section>
            <section class="card">
              <div class="card-head"><div><h2>Độ lệch so với giá trị đồng thuận</h2><p class="sub">Thanh = dự đoán − trung vị (cm); trục 0 là giá trị đồng thuận</p></div></div>
              <div class="chart-box short"><canvas id="devChart" role="img" aria-label="Độ lệch của 5 mô hình so với giá trị đồng thuận"></canvas></div>
            </section>
          </div>
        </div>

        <section class="card">
          <div class="card-head"><div><h2>Lưu vào lịch sử</h2>
            <p class="sub">Lưu 5 dự đoán hiện tại (kèm thời gian chạy) vào CSDL. Nếu đã đo thật cây hoa, nhập giá trị để so sai số.</p></div></div>
          <div class="btn-row" style="align-items:flex-end">
            <label class="field" style="max-width:220px">Giá trị thật petal_width (cm, không bắt buộc)
              <input class="input" id="actual" type="number" min="0" max="10" step="0.1" placeholder="VD: 1.3"></label>
            <button class="btn" id="save" type="button">${icon("save", 16)}Lưu 5 dự đoán</button>
            <span class="sub" id="saveHint">${getAuth() ? "" : "Cần đăng nhập để lưu."}</span>
          </div>
        </section>
      </div>`;

    const devChart = chart(view.querySelector("#devChart"), {
      type: "bar",
      data: {
        labels: MODEL_KEYS.map(k => MODEL_SHORT[k]),
        datasets: [{ label: "Độ lệch (cm)", data: [0, 0, 0, 0, 0], backgroundColor: MODEL_KEYS.map(k => MODEL_COLORS[k]), borderRadius: 4, barPercentage: 0.6 }],
      },
      options: {
        indexAxis: "y",
        animation: { duration: 200 },
        scales: {
          x: { title: { display: true, text: "cm so với trung vị" }, ticks: { callback: v => num(v, 3) }, grid: { color: c => (c.tick.value === 0 ? "#1E2A5A" : "#EEF0F7") } },
          y: { grid: { display: false } },
        },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${signed(c.raw, 4)} cm` } } },
      },
    });

    let latest = null;
    let seq = 0;
    const run = async () => {
      const my = ++seq;
      const started = performance.now();
      try {
        const res = await modelApi("/regression/arena", { method: "POST", body: input });
        if (my !== seq || !ctx.alive()) return;   // a newer request superseded this one
        latest = res;
        const rtt = performance.now() - started;
        view.querySelector("#latency").textContent =
          `Phản hồi ${duration(rtt)} (máy chủ xử lý ${duration(res.total_ms)}) · đầu vào: ${INPUTS.map(f => `${f}=${num(input[f], 1)}`).join(", ")}, ${input.species}`;
        view.querySelector("#cards").innerHTML = res.results.map(r => modelCard(r, res.most_deviant.model)).join("");
        view.querySelector("#consensus").innerHTML = `
          <div class="stat"><div class="label">Giá trị đồng thuận (trung vị)</div><div class="value">${num(res.consensus, 3)} cm</div><div class="sub">trung bình: ${num(res.mean, 3)} cm</div></div>
          <div class="stat"><div class="label">Độ phân tán (max − min)</div><div class="value">${num(res.spread, 3)} cm</div><div class="sub">${res.spread < 0.05 ? "5 mô hình gần như đồng ý" : "các mô hình bất đồng rõ"}</div></div>
          <div class="stat"><div class="label">Mô hình lệch nhiều nhất</div><div class="value" style="font-size:17px">${esc(res.most_deviant.label)}</div><div class="sub">${signed(res.most_deviant.deviation, 3)} cm so với trung vị</div></div>`;
        const devs = MODEL_KEYS.map(k => res.results.find(r => r.model === k).deviation);
        const lim = Math.max(0.01, ...devs.map(Math.abs)) * 1.15;
        devChart.data.labels = MODEL_KEYS.map(k => MODEL_SHORT[k]);
        devChart.data.datasets[0].data = devs;
        devChart.options.scales.x.min = -lim;
        devChart.options.scales.x.max = lim;
        devChart.update();
      } catch (err) {
        if (my !== seq || !ctx.alive()) return;
        view.querySelector("#cards").innerHTML = `<div style="grid-column:1/-1">${errorState(err.message)}</div>`;
        view.querySelector("#latency").textContent = "Lỗi khi gọi API";
      }
    };
    const debounced = debounce(run, DEBOUNCE_MS);

    view.querySelectorAll('input[type="range"]').forEach(el => {
      el.addEventListener("input", () => {
        const f = el.dataset.feature;
        input[f] = parseFloat(el.value);
        view.querySelector(`#val-${f}`).textContent = `${num(input[f], 1)} cm`;
        debounced();
      });
    });
    view.querySelectorAll("#speciesSeg button").forEach(btn => {
      btn.addEventListener("click", () => {
        input.species = btn.dataset.sp;
        view.querySelectorAll("#speciesSeg button").forEach(b => b.classList.toggle("active", b === btn));
        debounced();
      });
    });
    onClick(view, "#reset", () => {
      Object.assign(input, meansOf(ctx.species), { species: ctx.species });
      INPUTS.forEach(f => {
        view.querySelector(`#sl-${f}`).value = input[f];
        view.querySelector(`#val-${f}`).textContent = `${num(input[f], 1)} cm`;
      });
      view.querySelectorAll("#speciesSeg button").forEach(b => b.classList.toggle("active", b.dataset.sp === input.species));
      run();
    });

    onClick(view, "#save", async e => {
      if (!getAuth()) { toast("Hãy đăng nhập để lưu lịch sử"); location.hash = "#/dang-nhap"; return; }
      if (!latest) { toast("Chưa có kết quả để lưu"); return; }
      const raw = view.querySelector("#actual").value;
      const actual = raw === "" ? null : parseFloat(raw);
      if (actual !== null && (Number.isNaN(actual) || actual < 0)) { toast("Giá trị thật phải là số không âm"); return; }
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const items = latest.results.map(r => ({
          task: "regression", model: r.model, input: latest.input, predicted_value: r.prediction,
          runtime_ms: r.runtime_ms, actual_value: actual,
        }));
        const res = await dbApi("/predictions", { method: "POST", auth: true, body: { items } });
        toast(`Đã lưu ${res.ids.length} dự đoán vào lịch sử`);
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false;
      }
    });

    run();
  },
};
