import React from 'react';
import { exportPdf } from '../../lib/exportPdf';

type Props = {
  searchText: string;
  onSearchText: (v: string) => void;

  placeholder?: string;

  onPreview: () => void;
  status?: string;
};

export default function AddressForm(props: Props) {
  const { searchText, onSearchText, placeholder, onPreview, status } = props;

  return (
    <div className="form-grid">
      <div className="group">
        <div className="row" style={{ gap: 4 }}>
          <label>
            ADDRESS <span style={{ color:'#9ca3af', fontWeight: 400 }}>(or Lat / Long)</span>
          </label>
          <textarea
            className="native-reset"
            rows={2}
            value={searchText}
            onChange={e=>onSearchText(e.target.value)}
            placeholder={placeholder || 'Search for Address'}
          />
        </div>
      </div>

      <div className="group">
        <div className="row">
          <label>GIS LINKS</label>
          <a href="https://gispublic.waterboards.ca.gov/portal/apps/webappviewer/index.html?id=d71546a521ed4829aaa0e6c7b245fd56" target="_blank" rel="noreferrer">LS Factor (State Water Board GIS)</a>
          <a href="https://gispublic.waterboards.ca.gov/portal/apps/webappviewer/index.html?id=59bb6ae7996d415bb43d13420212a823" target="_blank" rel="noreferrer">K Factor (State Water Board GIS)</a>
        </div>
      </div>

      <div className="row" style={{display:'grid', gap:8, marginLeft:12}}>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <button className="btn btn-primary" onClick={onPreview} style={{ flex: 1, justifyContent: 'center' }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6}}>
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"></path>
            </svg>
            Preview
          </button>
          <button
            className="btn btn-export"
            onClick={async ()=>{
              const el = document.getElementById('pdf-page');
              if (el) {
                await exportPdf({ rootEl: el as HTMLElement, filenameHint: searchText });
              }
            }}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6}}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export PDF
          </button>
        </div>
        {status ? <div style={{color:'#6b7280', fontSize:12}}>{status}</div> : null}
      </div>
    </div>
  );
}
