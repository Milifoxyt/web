/* milifo blog 前端：时钟、入场动画、图片上传、页面内容编辑器 */
(function () {
  'use strict';

  /* ---------------------------- 年份 ---------------------------- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ---------------------------- 本地时间（上海） ---------------------------- */
  var clock = document.getElementById('clock');
  if (clock) {
    var fmt;
    try {
      fmt = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (e) {
      fmt = null;
    }
    var tick = function () {
      var now = new Date();
      clock.textContent = fmt ? fmt.format(now) : now.toTimeString().slice(0, 5);
      clock.setAttribute('datetime', now.toISOString());
    };
    tick();
    setInterval(tick, 30000);
  }

  /* ---------------------------- 顶栏状态 ---------------------------- */
  var topbar = document.querySelector('.topbar');
  if (topbar) {
    var onScroll = function () {
      topbar.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------------------------- 入场动画 ---------------------------- */
  var reveals = document.querySelectorAll('.reveal');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reveals.length) {
    if (!('IntersectionObserver' in window) || reduce) {
      reveals.forEach(function (el) { el.classList.add('is-in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
      reveals.forEach(function (el) { io.observe(el); });
    }
  }

  /* ---------------------------- 图片上传 ---------------------------- */
  document.querySelectorAll('[data-uploader]').forEach(function (box) {
    var input = box.querySelector('[data-upload-input]');
    var hidden = box.querySelector('input[name="cover"]');
    var preview = box.querySelector('.uploader__preview');
    if (!input) return;

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;

      var m = /(\.[a-z0-9]+)$/i.exec(file.name);
      var ext = m ? m[1].toLowerCase() : '.jpg';

      box.classList.add('is-loading');

      fetch('/api/upload', {
        method: 'POST',
        headers: { 'x-filename': 'image' + ext },
        body: file
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || '上传失败');
            return data;
          });
        })
        .then(function (data) {
          hidden.value = data.url;
          if (preview) {
            preview.src = data.url;
            preview.hidden = false;
          }
        })
        .catch(function (err) {
          window.alert(err.message || '上传失败，稍后再试');
        })
        .then(function () {
          box.classList.remove('is-loading');
          input.value = '';
        });
    });
  });

  /* ---------------------------- 重复行增删 ---------------------------- */
  function fieldSpec(container) {
    return (container.dataset.fields || '')
      .split(',')
      .map(function (s) { return s.trim(); })
      .filter(Boolean)
      .map(function (pair) {
        var i = pair.indexOf(':');
        return i < 0 ? { k: pair, ph: '' } : { k: pair.slice(0, i), ph: pair.slice(i + 1) };
      });
  }

  function makeRow(container) {
    var isPlace = container.classList.contains('repeat--place');
    var row = document.createElement('div');
    row.className = 'repeat__row' + (isPlace ? ' repeat__row--place' : '');

    fieldSpec(container).forEach(function (f) {
      var el = document.createElement('input');
      el.dataset.k = f.k;
      el.placeholder = f.ph;
      if (f.k === 'h') el.className = 'w-hue';
      else if (f.k === 'meta1' || f.k === 'meta2') el.className = 'w-short';
      else if (f.k === 'label') el.className = 'w-short';
      row.appendChild(el);
    });

    row.appendChild(removeButton());
    return row;
  }

  function removeButton() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn--small btn--danger';
    b.dataset.remove = '';
    b.textContent = '删';
    return b;
  }

  document.querySelectorAll('[data-repeat]').forEach(function (container) {
    container.addEventListener('click', function (e) {
      var add = e.target.closest('[data-add]');
      var del = e.target.closest('[data-remove]');

      if (add) {
        var row = makeRow(container);
        container.insertBefore(row, add);
        var first = row.querySelector('input');
        if (first) first.focus();
      }

      if (del) {
        var target = del.closest('.repeat__row');
        var rows = container.querySelectorAll('.repeat__row');
        if (rows.length <= 1) {
          rows.forEach(function (r) {
            r.querySelectorAll('input').forEach(function (i) { i.value = ''; });
          });
        } else if (target) {
          target.remove();
        }
      }
    });
  });

  /* ---------------------------- 页面内容编辑器 ---------------------------- */
  var settingsForm = document.querySelector('[data-settings-form]');
  if (settingsForm) {
    var setPath = function (obj, key, value) {
      var parts = key.split('.');
      var cur = obj;
      for (var i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
    };

    settingsForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var payload = {};

      settingsForm.querySelectorAll('input[name], textarea[name], select[name]').forEach(function (el) {
        if (el.closest('[data-repeat]')) return;
        setPath(payload, el.name, el.value);
      });

      settingsForm.querySelectorAll('[data-repeat]').forEach(function (container) {
        var key = container.dataset.repeat;
        var rows = Array.prototype.map.call(container.querySelectorAll('.repeat__row'), function (row) {
          var obj = {};
          row.querySelectorAll('[data-k]').forEach(function (input) {
            obj[input.dataset.k] = input.value;
          });
          return obj;
        });
        setPath(payload, key, rows);
      });

      if (payload.about && typeof payload.about.paragraphs === 'string') {
        payload.about.paragraphs = payload.about.paragraphs
          .split(/\n\s*\n/)
          .map(function (s) { return s.trim(); })
          .filter(Boolean);
      }

      var button = settingsForm.querySelector('button[type="submit"]');
      var label = button ? button.textContent : '';
      if (button) {
        button.disabled = true;
        button.textContent = '保存中…';
      }

      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || '保存失败');
            return data;
          });
        })
        .then(function () {
          flash('已保存，刷新首页就能看到。', false);
          if (button) button.textContent = '已保存 ✓';
          window.setTimeout(function () {
            if (button) {
              button.disabled = false;
              button.textContent = label;
            }
          }, 2200);
        })
        .catch(function (err) {
          flash(err.message || '保存失败', true);
          if (button) {
            button.disabled = false;
            button.textContent = label;
          }
        });
    });
  }

  function flash(text, isError) {
    var el = document.querySelector('.flash--js');
    if (!el) {
      el = document.createElement('p');
      el.className = 'flash flash--js';
      var anchor = settingsForm ? settingsForm.parentNode : document.body;
      anchor.insertBefore(el, settingsForm || null);
    }
    el.textContent = text;
    el.className = 'flash flash--js' + (isError ? ' flash--err' : '');
  }
})();
