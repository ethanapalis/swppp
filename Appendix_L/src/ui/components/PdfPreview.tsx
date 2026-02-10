import React from 'react';

type FactorResult = {
  value: string;
  popupText: string;
  screenshotBase64: string;
  basemapBase64?: string;
  basemapReferenceBase64?: string;
};

export default function PdfPreview({ projectTitle, address, ls, k }:{
  projectTitle: string;
  address: string;
  ls: FactorResult | null;
  k: FactorResult | null;
}) {
  const lsValue = ls?.value;
  const kValue = k?.value;
  const lsDisplay = lsValue === null || lsValue === undefined || String(lsValue).trim() === '' ? '—' : String(lsValue);
  const kDisplay = kValue === null || kValue === undefined || String(kValue).trim() === '' ? '—' : String(kValue);

  function renderMap(f: FactorResult, title: string) {
    const hasBasemap = Boolean(f.basemapBase64);
    if (hasBasemap) {
      const v = f.value === null || f.value === undefined || String(f.value).trim() === '' ? '—' : String(f.value);
      const popupTitle = title === 'K'
        ? `Soil Erodibility (K) Value: ${v}`
        : `Linear Slope (LS) Factor = ${v}`;

      return (
        <div style={{ position: 'relative', width: '100%', height: 410, border: '1px solid #d1d5db', overflow: 'hidden' }}>
          <img
            alt={`${title} basemap`}
            src={`data:image/jpeg;base64,${f.basemapBase64}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />

          {f.screenshotBase64 ? (
            <img
              alt={`${title} overlay`}
              src={`data:image/png;base64,${f.screenshotBase64}`}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.85)', opacity: 0.55 }}
            />
          ) : null}

          {f.basemapReferenceBase64 ? (
            <img
              alt={`${title} labels`}
              src={`data:image/png;base64,${f.basemapReferenceBase64}`}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : null}

          <div style={{ position: 'absolute', left: 12, top: 12, width: 230, pointerEvents: 'none' }}>
            <div style={{ border: '1px solid #d1d5db', borderRadius: 4, overflow: 'hidden', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              <div style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb', padding: '6px 8px', fontSize: 12, fontWeight: 600, color: '#111827' }}>
                {popupTitle}
              </div>
              <div style={{ padding: '6px 8px', fontSize: 11, color: '#374151' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td style={{ width: 44, fontWeight: 600, paddingRight: 6 }}>OID</td>
                      <td style={{ textAlign: 'right' }}>{f.popupText ? (() => {
                        try {
                          const o = JSON.parse(f.popupText);
                          return String(o?.OID ?? o?.ObjectID ?? o?.OBJECTID ?? '—');
                        } catch {
                          return '—';
                        }
                      })() : '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (f.screenshotBase64) {
      return (
        <img
          alt={`${title} Factor map`}
          src={`data:image/jpeg;base64,${f.screenshotBase64}`}
          style={{ width: '100%', height: 410, objectFit: 'cover', border: '1px solid #d1d5db' }}
        />
      );
    }

    return <div className="pdf-map">{title} Factor map capture placeholder</div>;
  }

  return (
    <div className="pdf-page" id="pdf-page">
      <div className="pdf-inner">
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }} className="pdf-header">Length-Slope (LS) and Soil Erodibility (K) Factors</div>
          <div style={{ fontSize: 13.5, color: '#374151' }}>
            {projectTitle ? <div>Project: {projectTitle}</div> : null}
            <div>Location: {address || '—'}</div>
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>LS Factor: {lsDisplay}</div>
          {ls?.screenshotBase64 ? (
            <div>{renderMap(ls, 'LS')}</div>
          ) : (
            <div className="pdf-map">LS Factor map capture placeholder</div>
          )}
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>K Factor: {kDisplay}</div>
          {k?.screenshotBase64 ? (
            <div>{renderMap(k, 'K')}</div>
          ) : (
            <div className="pdf-map">K Factor map capture placeholder</div>
          )}
        </div>
      </div>

      <div className="pdf-footer">
        Data Source: 2022 Construction Stormwater General Permit | California State Water Resources Control Board GIS
      </div>
    </div>
  );
}
