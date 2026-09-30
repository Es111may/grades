'use client';

/**
 * Последний рубеж: ошибка в самом корневом layout. Он в этот момент не
 * отрисован — ни globals.css, ни шрифтов, ни темы может не быть, поэтому
 * своя html/body и инлайн-стили в цветах тёмной темы (дефолт сервиса) и
 * системным шрифтом. Деталей ошибки не показываем.
 *
 * «Обновить» — полная перезагрузка: reset() перерисовал бы тот же упавший
 * layout без новых данных с сервера.
 */
export default function GlobalError() {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 16px',
          boxSizing: 'border-box',
          background: 'rgb(6 6 7)',
          color: 'rgb(245 245 247)',
          fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.25, fontWeight: 500, letterSpacing: '-0.02em' }}>
            Что-то пошло не так
          </h1>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 24,
              padding: '10px 16px',
              border: 0,
              borderRadius: 9999,
              background: 'rgb(213 255 12)',
              color: '#000',
              font: 'inherit',
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            Обновить
          </button>
        </div>
      </body>
    </html>
  );
}
