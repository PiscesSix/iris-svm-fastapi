// Overview page, laid out like docs/ui-reference.png. Every number comes from
// GET /dataset/summary (computed from Iris.csv) and GET /species.
import { modelApi, modelAsset } from "../api.js";
import { chart } from "../charts.js";
import { icon } from "../icons.js";
import { cap, errorState, esc, FEATURE_COLORS, FEATURE_SHORT, FEATURES, num, onClick, skeleton } from "../ui.js";

function caption(info) {
  return `<p class="caption">Nguồn: ${esc(info.source.replace(/^Wikimedia Commons\s*[-—]\s*/, ""))}, ${esc(info.license)},
    <a href="${esc(info.source_url)}" target="_blank" rel="noopener">${esc(info.source_url.replace("https://", ""))}</a></p>`;
}

function arrow(direction) {
  return `<div class="arrow-${direction}" aria-hidden="true"><span class="head a"></span><span class="shaft"></span><span class="head b"></span></div>`;
}

function loading(view) {
  view.innerHTML = `
    <div class="grid overview">
      <div class="card area-photo">${skeleton({ block: true, lines: 1 })}</div>
      <div class="card area-parts">${skeleton({ lines: 6 })}</div>
      <div class="card area-donut">${skeleton({ block: true, lines: 0 })}</div>
      <div class="area-side"><div class="card">${skeleton({ lines: 6 })}</div><div class="card">${skeleton({ lines: 4 })}</div></div>
    </div>`;
}

export default {
  title: "Phân tích dữ liệu hoa Iris",
  subtitle: "Khám phá đặc điểm và so sánh các loài hoa trong bộ dữ liệu Iris",
  icon: "flower-2",

  async render(view, ctx) {
    loading(view);
    let summary, speciesList;
    try {
      [summary, speciesList] = await Promise.all([modelApi("/dataset/summary"), modelApi("/species")]);
    } catch (err) {
      if (!ctx.alive()) return;
      view.innerHTML = `<div class="card">${errorState(err.message, "retry")}</div>`;
      onClick(view, "#retry", () => this.render(view, ctx));
      return;
    }
    if (!ctx.alive()) return;

    const s = summary.species.find(x => x.species === ctx.species);
    const info = speciesList.species.find(x => x.species_key === ctx.species);
    const name = cap(s.species);
    const st = s.stats;

    const bars = FEATURES.map(f => `
      <div>
        <div class="bar-label"><span>${esc(FEATURE_SHORT[f])}</span><span>${num(st[f].mean)} cm · ${num(s.mean_shares[f], 1)}%</span></div>
        <div class="track" role="img" aria-label="${esc(FEATURE_SHORT[f])} ${num(s.mean_shares[f], 1)}%">
          <div class="fill" style="width:${s.mean_shares[f]}%;background:${FEATURE_COLORS[f]}"></div>
        </div>
      </div>`).join("");

    const legend = FEATURES.map(f => `
      <li><span class="dot" style="background:${FEATURE_COLORS[f]}"></span><span>${esc(FEATURE_SHORT[f])}</span><b>${num(s.mean_shares[f], 1)}%</b></li>`).join("");

    const statsRows = FEATURES.map(f => `
      <tr><td><span class="swatch" style="background:${FEATURE_COLORS[f]}"></span>${esc(FEATURE_SHORT[f])}</td>
        <td class="num">${num(st[f].mean, 3)}</td><td class="num">${num(st[f].std, 3)}</td>
        <td class="num">${num(st[f].min, 1)}</td><td class="num">${num(st[f].max, 1)}</td></tr>`).join("");

    view.innerHTML = `
      <div class="grid overview">
        <section class="card area-photo">
          <div class="card-head"><h2>Hoa Iris ${esc(name)}</h2></div>
          <div class="photo-wrap">
            <div class="dim-v">
              <div class="label">Dài đài hoa trung bình<b>${num(st.sepal_length.mean)} cm</b></div>
              ${arrow("v")}
            </div>
            <img class="photo" src="${esc(modelAsset(info.image_url))}" alt="${esc(info.alt_text)}">
            <div class="dim-h">${arrow("h")}Rộng đài hoa trung bình<b>${num(st.sepal_width.mean)} cm</b></div>
          </div>
          ${caption(info)}
        </section>

        <section class="card area-parts">
          <div class="card-head"><div><h2>Tỷ lệ các bộ phận</h2>
            <p class="sub">Phần của mỗi kích thước trong tổng 4 kích thước trung bình (${num(Object.values(st).reduce((a, v) => a + v.mean, 0))} cm)</p></div></div>
          <div class="bars">${bars}</div>
        </section>

        <section class="card area-donut">
          <div class="band-title">Biểu đồ tỉ lệ các bộ phận của hoa (${esc(name)})</div>
          <div class="donut-wrap">
            <div class="donut-box">
              <canvas id="donut" role="img" aria-label="Biểu đồ tròn tỉ lệ 4 kích thước của ${esc(name)}"></canvas>
              <div class="donut-center"><div><b>${esc(name)}</b><span>${s.count} mẫu</span></div></div>
            </div>
            <ul class="legend">${legend}</ul>
          </div>
          <div class="table-wrap" style="margin-top:16px">
            <table class="data">
              <caption class="sr-only">Thống kê mô tả của ${esc(name)}</caption>
              <thead><tr><th>Đặc trưng (cm)</th><th class="num">Trung bình</th><th class="num">Độ lệch chuẩn</th><th class="num">Nhỏ nhất</th><th class="num">Lớn nhất</th></tr></thead>
              <tbody>${statsRows}</tbody>
            </table>
          </div>
        </section>

        <aside class="area-side">
          <section class="card">
            <div class="band-title">Kết quả phân tích</div>
            <div class="kv">
              <div class="kv-row">${icon("flower-2", 24)}<div><div class="kv-label">Loài hoa</div><div class="kv-value">${esc(name)}</div></div></div>
              <div class="kv-row">${icon("ruler", 24)}<div><div class="kv-label">Chiều dài đài hoa trung bình</div><div class="kv-value">${num(st.sepal_length.mean)} cm</div></div></div>
              <div class="kv-row">${icon("move-horizontal", 24)}<div><div class="kv-label">Chiều rộng đài hoa trung bình</div><div class="kv-value">${num(st.sepal_width.mean)} cm</div></div></div>
              <div class="kv-row">${icon("leaf", 24)}<div><div class="kv-label">Cánh hoa trung bình (dài × rộng)</div><div class="kv-value">${num(st.petal_length.mean)} × ${num(st.petal_width.mean)} cm</div></div></div>
              <div class="kv-row">${icon("chart-pie", 24)}<div><div class="kv-label">Tỷ lệ trong dữ liệu</div><div class="kv-value" style="color:var(--primary)">${num(s.share_of_dataset, 1)}% (${s.count}/${summary.n_samples})</div></div></div>
            </div>
          </section>
          <section class="card">
            <h2 style="margin-bottom:12px">Đặc điểm nổi bật</h2>
            <ul class="bullets">${s.highlights.map(h => `<li>${esc(h)}</li>`).join("")}</ul>
          </section>
          <section class="card tinted remark">
            ${icon("lightbulb", 24)}
            <div><h3>Nhận xét</h3><p>${esc(s.remark)}</p></div>
          </section>
        </aside>
      </div>
      <p class="caption" style="margin-top:14px">Dữ liệu: ${esc(summary.source)} · ${summary.n_samples} mẫu · số liệu tính trực tiếp từ tệp CSV qua API <code>/dataset/summary</code>.</p>`;

    chart(view.querySelector("#donut"), {
      type: "doughnut",
      data: {
        labels: FEATURES.map(f => FEATURE_SHORT[f]),
        datasets: [{
          data: FEATURES.map(f => s.mean_shares[f]),
          backgroundColor: FEATURES.map(f => FEATURE_COLORS[f]),
          borderColor: "#fff",
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        cutout: "58%",
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => ` ${c.label}: ${num(c.parsed, 1)}% (${num(st[FEATURES[c.dataIndex]].mean)} cm)` } },
        },
      },
    });
  },
};
