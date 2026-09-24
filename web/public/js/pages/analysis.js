// Advanced analysis (highlight feature): regularization paths and residual diagnostics.
import { modelApi } from "../api.js";
import { chart } from "../charts.js";
import { icon } from "../icons.js";
import { errorState, esc, FEATURE_SHORT, MODEL_COLORS, MODEL_KEYS, num, onClick, PALETTE, skeleton } from "../ui.js";

const REGULARIZED = ["ridge", "lasso", "elasticnet"];
const LABELS = { linear: "Linear Regression", polynomial: "Polynomial Regression", ridge: "Ridge", lasso: "Lasso", elasticnet: "ElasticNet" };

const SUPERSCRIPT = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };

// Label only the powers of ten on the log axis, e.g. 10⁻⁴.
const axisLog = v => {
  const p = Math.round(Math.log10(v) * 1e6) / 1e6;
  return Number.isInteger(p) ? `10${String(p).split("").map(c => SUPERSCRIPT[c]).join("")}` : "";
};

export default {
  title: "Phân tích nâng cao",
  subtitle: "Regularization path của Ridge / Lasso / ElasticNet và chẩn đoán phần dư của 5 mô hình",
  icon: "chart-spline",

  async render(view, ctx) {
    view.innerHTML = `<div class="stack"><div class="card">${skeleton({ block: true, lines: 2 })}</div><div class="card">${skeleton({ block: true, lines: 2 })}</div></div>`;
    let report;
    try {
      report = await modelApi("/regression/metrics");
    } catch (err) {
      if (!ctx.alive()) return;
      view.innerHTML = `<div class="card">${errorState(err.message, "retry")}</div>`;
      onClick(view, "#retry", () => this.render(view, ctx));
      return;
    }
    if (!ctx.alive()) return;
    const byKey = Object.fromEntries(report.models.map(m => [m.model, m]));

    view.innerHTML = `
      <div class="stack">
        <section class="card tinted highlight-banner">
          ${icon("sparkles", 22)}
          <div><h2>Điểm nổi bật · Nhìn vào bên trong mô hình</h2>
            <p>Regularization path cho thấy từng hệ số co lại thế nào khi tăng α; biểu đồ chẩn đoán cho thấy mô hình sai ở đâu trên
              ${report.data.test_size} mẫu test. Tất cả tính từ lần train lúc ${new Date(report.trained_at).toLocaleString("vi-VN")}.</p></div>
        </section>

        <section class="card">
          <div class="card-head">
            <div><h2>Regularization path</h2><p class="sub">Hệ số (trên đặc trưng đã chuẩn hoá) theo α, trục α thang log</p></div>
            <div class="segmented" id="pathSeg">
              ${REGULARIZED.map((k, i) => `<button type="button" data-model="${k}" class="${i === 1 ? "active" : ""}">${LABELS[k]}</button>`).join("")}
            </div>
          </div>
          <div class="grid analysis-layout">
            <div>
              <div class="chart-box tall"><canvas id="pathChart" role="img" aria-label="Đường hệ số theo alpha"></canvas></div>
              <p class="sub" id="pathNote"></p>
            </div>
            <div class="stack">
              <div class="card tinted remark" style="box-shadow:none">
                ${icon("lightbulb", 22)}
                <div><h3>Vì sao Lasso ép hệ số về 0?</h3>
                  <p>Lasso phạt tổng trị tuyệt đối <b>α·Σ|wⱼ|</b> (chuẩn L1). Đạo hàm của |w| không đổi (±1) dù w nhỏ đến đâu,
                  nên lời giải có dạng <i>ngưỡng mềm</i>: w = sign(z)·max(|z| − α, 0) — hệ số nào có tín hiệu |z| nhỏ hơn α bị cắt đúng bằng 0.
                  Về hình học, miền ràng buộc L1 là hình thoi có các đỉnh nằm trên trục, nên đường đồng mức của sai số thường chạm vào đỉnh
                  (một số toạ độ bằng 0). Ridge phạt <b>α·Σwⱼ²</b>: đạo hàm 2αw tiến về 0 cùng w nên hệ số chỉ nhỏ dần, không bao giờ bằng 0.
                  ElasticNet trộn cả hai theo l1_ratio.</p></div>
              </div>
              <div class="table-wrap" id="coefTable"></div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div><h2>Chẩn đoán mô hình</h2><p class="sub" id="diagSub">Tập test</p></div>
            <label class="field" style="min-width:220px">Chọn mô hình
              <select class="input" id="diagModel">
                ${MODEL_KEYS.map(k => `<option value="${k}" ${k === report.best_model ? "selected" : ""}>${LABELS[k]}${k === report.best_model ? " (tốt nhất)" : ""}</option>`).join("")}
              </select></label>
          </div>
          <div class="grid cols-2">
            <div><h3 style="font-size:14px;color:var(--title);margin:0 0 6px">Actual vs Predicted</h3>
              <div class="chart-box"><canvas id="avpChart" role="img" aria-label="Giá trị thật so với dự đoán"></canvas></div></div>
            <div><h3 style="font-size:14px;color:var(--title);margin:0 0 6px">Phần dư (thật − dự đoán)</h3>
              <div class="chart-box"><canvas id="resChart" role="img" aria-label="Phần dư theo giá trị dự đoán"></canvas></div></div>
          </div>
          <p class="caption">Điểm càng sát đường chéo y = x càng tốt; phần dư nên rải đều quanh 0, không có hình dạng (nếu có dạng cong là mô hình bỏ sót quan hệ phi tuyến).</p>
        </section>
      </div>`;

    const loadPath = async key => {
      const note = view.querySelector("#pathNote");
      try {
        const path = await modelApi(`/regression/regularization-path?model=${key}`);
        if (!ctx.alive()) return;
        const bestAlpha = byKey[key].best_params.alpha;
        const datasets = path.features.map((f, i) => ({
          label: FEATURE_SHORT[f] || f,
          data: path.alphas.map((a, j) => ({ x: a, y: path.coefficients[f][j] })),
          borderColor: PALETTE[i], backgroundColor: PALETTE[i], showLine: true, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2,
        }));
        const ys = path.features.flatMap(f => path.coefficients[f]);
        datasets.push({
          label: `α tốt nhất (${num(bestAlpha, 4)})`,
          data: [{ x: bestAlpha, y: Math.min(...ys) }, { x: bestAlpha, y: Math.max(...ys) }],
          borderColor: "#1E2A5A", borderDash: [5, 4], borderWidth: 1.5, showLine: true, pointRadius: 0,
        });
        chart(view.querySelector("#pathChart"), {
          type: "scatter",
          data: { datasets },
          options: {
            interaction: { mode: "nearest", intersect: false },
            scales: {
              x: { type: "logarithmic", title: { display: true, text: "α (thang log)" }, ticks: { callback: axisLog } },
              y: { title: { display: true, text: "Hệ số" } },
            },
            plugins: {
              legend: { position: "bottom" },
              tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${num(c.parsed.y, 4)} (α = ${num(c.parsed.x, 4)})` } },
            },
          },
        });
        note.textContent = `${path.label}${path.l1_ratio ? ` (l1_ratio = ${path.l1_ratio})` : ""}: số hệ số khác 0 giảm từ ${path.n_nonzero[0]} (α = ${num(path.alphas[0], 4)}) `
          + `xuống ${path.n_nonzero[path.n_nonzero.length - 1]} (α = ${num(path.alphas[path.alphas.length - 1], 0)}). `
          + `Tại α tốt nhất theo GridSearchCV còn ${byKey[key].n_nonzero_coef}/${byKey[key].n_coefficients} hệ số khác 0.`;
        const coefs = byKey[key].coefficients || {};
        view.querySelector("#coefTable").innerHTML = `
          <table class="data"><caption class="sr-only">Hệ số tại alpha tốt nhất</caption>
            <thead><tr><th>Hệ số của ${esc(path.label)} tại α tốt nhất</th><th class="num">Giá trị</th></tr></thead>
            <tbody>${path.features.map((f, j) => `<tr><td><span class="swatch" style="background:${PALETTE[j]}"></span>${esc(FEATURE_SHORT[f] || f)}</td>
              <td class="num">${num(coefs[f], 4)}</td></tr>`).join("")}</tbody></table>`;
      } catch (err) {
        if (ctx.alive()) note.innerHTML = `<span style="color:var(--bad)">${esc(err.message)}</span>`;
      }
    };

    const loadDiag = async key => {
      try {
        const d = await modelApi(`/regression/diagnostics?model=${key}`);
        if (!ctx.alive()) return;
        view.querySelector("#diagSub").textContent =
          `${d.label} · ${d.actual.length} mẫu test · R² = ${num(d.metrics.r2, 4)} · MAE = ${num(d.metrics.mae, 4)} cm · RMSE = ${num(d.metrics.rmse, 4)} cm`;
        const color = MODEL_COLORS[key];
        const species = d.inputs.map(x => x.species);
        const lo = Math.min(...d.actual, ...d.predicted) - 0.1;
        const hi = Math.max(...d.actual, ...d.predicted) + 0.1;
        const tip = i => `${species[i]} · thật ${num(d.actual[i], 2)} / dự đoán ${num(d.predicted[i], 3)} cm`;
        chart(view.querySelector("#avpChart"), {
          type: "scatter",
          data: {
            datasets: [
              { label: "Mẫu test", data: d.actual.map((a, i) => ({ x: a, y: d.predicted[i] })), backgroundColor: color + "CC", borderColor: "#fff", borderWidth: 1, pointRadius: 5, pointHoverRadius: 7 },
              { label: "y = x (dự đoán hoàn hảo)", data: [{ x: lo, y: lo }, { x: hi, y: hi }], showLine: true, pointRadius: 0, borderColor: "#1E2A5A", borderDash: [5, 4], borderWidth: 1.5 },
            ],
          },
          options: {
            scales: { x: { min: lo, max: hi, title: { display: true, text: "Giá trị thật (cm)" } }, y: { min: lo, max: hi, title: { display: true, text: "Dự đoán (cm)" } } },
            plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: c => (c.datasetIndex === 0 ? ` ${tip(c.dataIndex)}` : " y = x") } } },
          },
        });
        const rmax = Math.max(...d.residuals.map(Math.abs)) * 1.2;
        chart(view.querySelector("#resChart"), {
          type: "scatter",
          data: {
            datasets: [
              { label: "Phần dư", data: d.predicted.map((p, i) => ({ x: p, y: d.residuals[i] })), backgroundColor: color + "CC", borderColor: "#fff", borderWidth: 1, pointRadius: 5, pointHoverRadius: 7 },
              { label: "0", data: [{ x: lo, y: 0 }, { x: hi, y: 0 }], showLine: true, pointRadius: 0, borderColor: "#1E2A5A", borderDash: [5, 4], borderWidth: 1.5 },
            ],
          },
          options: {
            scales: { x: { min: lo, max: hi, title: { display: true, text: "Dự đoán (cm)" } }, y: { min: -rmax, max: rmax, title: { display: true, text: "Thật − dự đoán (cm)" } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => (c.datasetIndex === 0 ? ` ${tip(c.dataIndex)} · dư ${num(d.residuals[c.dataIndex], 3)}` : " 0") } } },
          },
        });
      } catch (err) {
        if (ctx.alive()) view.querySelector("#diagSub").innerHTML = `<span style="color:var(--bad)">${esc(err.message)}</span>`;
      }
    };

    view.querySelectorAll("#pathSeg button").forEach(btn => btn.addEventListener("click", () => {
      view.querySelectorAll("#pathSeg button").forEach(b => b.classList.toggle("active", b === btn));
      loadPath(btn.dataset.model);
    }));
    view.querySelector("#diagModel").addEventListener("change", e => loadDiag(e.target.value));

    loadPath("lasso");
    loadDiag(report.best_model);
  },
};
