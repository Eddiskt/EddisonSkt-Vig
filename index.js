// index.js
document.addEventListener('DOMContentLoaded', () => {
  // — DOM & Canvas —
  const cv         = document.getElementById('cv');
  const ctx        = cv.getContext('2d');
  const W          = cv.width, H = cv.height;
  const Linput     = document.getElementById('beamLength');
  const weightIn   = document.getElementById('weight');
  const angleIn    = document.getElementById('angle');
  const addBtn     = document.getElementById('addForce');
  const forcesUI   = document.getElementById('forcesUI');
  const AxOut      = document.getElementById('Ax');
  const AyOut      = document.getElementById('Ay');
  const ByOut      = document.getElementById('By');
  const Mout       = document.getElementById('M');
  const L_AB_Input = document.getElementById('L_AB_Input');
  const momentRefs = Array.from(document.querySelectorAll('input[name=momentRef]'));

  const S = getComputedStyle(document.documentElement);
  const C = {
    beam0:  S.getPropertyValue('--beam0').trim(),
    beam1:  S.getPropertyValue('--beam1').trim(),
    beamBr: S.getPropertyValue('--beam-border').trim(),
    support:S.getPropertyValue('--support').trim(),
    user:   S.getPropertyValue('--user-arrow').trim(),
    weight: S.getPropertyValue('--weight-arrow').trim(),
  };

  // — Datos de la viga y apoyos —
  let beam = {
    realH: parseFloat(Linput.value),  // longitud horizontal proyectada (m)
    angle: parseFloat(angleIn.value)  // ángulo en grados
  };
  const center   = { x: W/2, y: H/2 };
  let supportA   = { t: 0 };          // t en [0,1]
  let supportB   = { t: 1 };
  let forces     = [];                // { mag, ang, t }
  let dragging   = null;              // 'A' o 'B'
  const toRad    = d => d * Math.PI/180;

  // longitud fija en px de la barra
  const barPx = W - 375;

  // — Geometría —
  function unitVec() {
    const r = toRad(beam.angle);
    return { x: Math.cos(r), y: -Math.sin(r) };
  }

  function posOnBeam(t) {
    const u  = unitVec();
    const dx = (t - 0.5) * barPx * u.x;
    const dy = (t - 0.5) * barPx * u.y;
    return { x: center.x + dx, y: center.y + dy };
  }

  // longitud real inclinada (m), evita div/0
  function getLReal() {
    const rad = toRad(beam.angle);
    const c   = Math.cos(rad), s = Math.sin(rad);
    return beam.realH / (Math.abs(c) < 1e-3 ? s : c);
  }

  // — Dibujado —
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const u      = unitVec();
    const perp   = { x: -u.y, y: u.x };
    const Astart = posOnBeam(0);
    const Bend   = posOnBeam(1);

    // viga
    const grad = ctx.createLinearGradient(
      Astart.x, Astart.y,
      Bend.x,   Bend.y
    );
    grad.addColorStop(0, C.beam0);
    grad.addColorStop(1, C.beam1);
    ctx.fillStyle   = grad;
    ctx.strokeStyle = C.beamBr;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo( Astart.x + perp.x*8,  Astart.y + perp.y*8 );
    ctx.lineTo( Bend.x   + perp.x*8,  Bend.y   + perp.y*8 );
    ctx.lineTo( Bend.x   - perp.x*8,  Bend.y   - perp.y*8 );
    ctx.lineTo( Astart.x - perp.x*8,  Astart.y - perp.y*8 );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // apoyos A y B
    [supportA.t, supportB.t].forEach((t, i) => {
      const p = posOnBeam(t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, 2*Math.PI);
      ctx.fillStyle = C.support;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '12px sans-serif';
      ctx.fillText(i===0?'A':'B', p.x, p.y);
    });

    // fuerzas + peso propio
    const list = [...forces];
    const Wt   = parseFloat(weightIn.value);
    if (Wt > 0) list.push({ mag: Wt, ang: 270, t: 0.5 });
    list.forEach(f => drawVec(f, f.mag===Wt ? C.weight : C.user));

    // reacciones y momento
    const { Ax, Ay, By, M } = compute(list);

    // actualiza UI
    const L_real = getLReal();
    const Ls     = Math.abs(supportB.t - supportA.t) * L_real;
    L_AB_Input.value     = Ls.toFixed(2);
    AxOut.textContent    = Ax.toFixed(2);
    AyOut.textContent    = Ay.toFixed(2);
    ByOut.textContent    = By.toFixed(2);
    Mout.textContent     = M.toFixed(2);

    // sincroniza distancias de fuerzas
    forcesUI.querySelectorAll('input[data-prop="distNum"]').forEach((inp,i) => {
      const dA = Math.abs(forces[i].t - supportA.t) * L_real;
      inp.value = dA.toFixed(2);
    });
    forcesUI.querySelectorAll('input[data-prop="distBNum"]').forEach((inp,i) => {
      const dB = Math.abs(supportB.t - forces[i].t) * L_real;
      inp.value = dB.toFixed(2);
    });
  }

  // dibujo de vectores de fuerza
  function drawVec(f, color) {
    const pos = posOnBeam(f.t);
    const rad = toRad(f.ang);
    const ux  = Math.cos(rad), uy = -Math.sin(rad);
    const len = 80;
    ctx.strokeStyle = ctx.fillStyle = color;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x + ux*len, pos.y + uy*len);
    ctx.stroke();
    // flecha
    const s = 6;
    ctx.beginPath();
    ctx.moveTo(pos.x + ux*len, pos.y + uy*len);
    ctx.lineTo(
      pos.x + ux*len - ux*s + uy*s*0.5,
      pos.y + uy*len - uy*s - ux*s*0.5
    );
    ctx.lineTo(
      pos.x + ux*len - ux*s - uy*s*0.5,
      pos.y + uy*len - uy*s + ux*s*0.5
    );
    ctx.closePath();
    ctx.fill();
  }

  // cálculo de reacciones y momento
  function compute(fs) {
    const L_real = getLReal();
    let sumFx = 0, sumFy = 0, MA = 0;
    fs.forEach(f => {
      const rad = toRad(f.ang);
      const Fx  = f.mag * Math.cos(rad);
      const Fy  = -f.mag * Math.sin(rad);
      sumFx += Fx; sumFy += Fy;
      MA    += Fy * ((f.t - supportA.t) * L_real);
    });
    const Ls  = (supportB.t - supportA.t) * L_real;
    const By  = -MA / Ls;
    const Ay  = -sumFy - By;
    const Ax  = -sumFx;
    // momento en A o B
    const ref = momentRefs.find(r=>r.checked).value;
    let M = 0;
    fs.forEach(f => {
      const Fy  = -f.mag * Math.sin(toRad(f.ang));
      const arm = ((ref === 'A'
        ? (f.t - supportA.t)
        : (supportB.t - f.t)
      ) * L_real);
      M += Fy * arm;
    });
    return { Ax, Ay, By, M };
  }

  // — UI de fuerzas —
  function renderForcesUI() {
    forcesUI.innerHTML = '';
    const L_real = getLReal();
    forces.forEach((f, i) => {
      const dA  = (Math.abs(f.t - supportA.t)*L_real).toFixed(2);
      const dB  = (Math.abs(supportB.t - f.t)*L_real).toFixed(2);
      const pct = (f.t * 100).toFixed(1);
      const div = document.createElement('div');
      div.className = 'force-item';
      div.innerHTML = `
        <div>
          <label>Mag (N):
            <input data-i="${i}" data-prop="mag" type="number"
                   step="1" value="${f.mag}">
          </label>
          <label>Ang (°):
            <input data-i="${i}" data-prop="ang" type="number"
                   min="0" max="360" step="1" value="${f.ang}">
          </label>
          <label>Dist A (m):
            <input data-i="${i}" data-prop="distNum" type="number"
                   step="0.01" min="0" max="${L_real.toFixed(2)}"
                   value="${dA}">
          </label>
          <label>Dist B (m):
            <input data-i="${i}" data-prop="distBNum" type="number"
                   step="0.01" min="0" max="${L_real.toFixed(2)}"
                   value="${dB}">
          </label>
          <label>Pos (%):
            <input data-i="${i}" data-prop="posRange" type="range"
                   min="0" max="100" step="0.1" value="${pct}">
          </label>
        </div>
        <button data-del="${i}">🗑️</button>
      `;
      forcesUI.appendChild(div);
    });

    forcesUI.querySelectorAll('input').forEach(inp => {
      inp.oninput = e => {
        const i    = +e.target.dataset.i;
        const prop = e.target.dataset.prop;
        let v      = parseFloat(e.target.value) || 0;
        const L_real = getLReal();

        if (prop === 'mag') {
          forces[i].mag = v;
        } else if (prop === 'ang') {
          forces[i].ang = Math.min(Math.max(v,0),360);
        } else if (prop === 'distNum') {
          v = Math.min(Math.max(v,0), L_real);
          forces[i].t = (supportA.t <= supportB.t
            ? supportA.t + v/L_real
            : supportA.t - v/L_real
          );
        } else if (prop === 'distBNum') {
          v = Math.min(Math.max(v,0), L_real);
          forces[i].t = (supportA.t <= supportB.t
            ? supportB.t - v/L_real
            : supportB.t + v/L_real
          );
        } else if (prop === 'posRange') {
          const t = Math.min(Math.max(v/100,0),1);
          forces[i].t = t;
        }
        draw();
      };
    });

    forcesUI.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        forces.splice(+btn.dataset.del,1);
        renderForcesUI();
        draw();
      };
    });
  }

  // — Drag de apoyos A & B —
  cv.addEventListener('mousedown', e => {
    const x = e.offsetX, y = e.offsetY;
    const Apos = posOnBeam(supportA.t), Bpos = posOnBeam(supportB.t);
    if (Math.hypot(x-Apos.x,y-Apos.y) < 12) dragging='A';
    else if (Math.hypot(x-Bpos.x,y-Bpos.y) < 12) dragging='B';
  });
  cv.addEventListener('mousemove', e => {
    if (!dragging) return;
    const x = e.offsetX, y = e.offsetY;
    const A0 = posOnBeam(0), u = unitVec();
    let d    = (x - A0.x)*u.x + (y - A0.y)*u.y;
    d        = Math.max(0, Math.min(d, barPx));
    const t  = d / barPx;
    if (dragging === 'A') supportA.t = t;
    else                  supportB.t = t;
    draw();
  });
  ['mouseup','mouseleave'].forEach(ev =>
    cv.addEventListener(ev, ()=> dragging = null)
  );

  // — Controles globales —
  addBtn.onclick = () => {
    forces.push({ mag: 100, ang: 270, t: 0.5 });
    renderForcesUI();
    draw();
  };
  Linput.onchange  = () => { beam.realH = parseFloat(Linput.value); renderForcesUI(); draw(); };
  weightIn.oninput = draw;
  angleIn.oninput  = () => { beam.angle = parseFloat(angleIn.value); draw(); };

  // editar Luz A–B con teclado
  L_AB_Input.oninput = () => {
    const L_real = getLReal();
    let v = Math.min(Math.max(parseFloat(L_AB_Input.value)||0, 0), L_real);
    supportB.t = supportA.t + (supportA.t <= supportB.t ? v/L_real : -v/L_real);
    draw();
  };

  // inicialización
  renderForcesUI();
  draw();
});