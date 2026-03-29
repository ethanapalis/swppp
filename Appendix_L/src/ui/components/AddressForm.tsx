import React from 'react';
import { exportPdf } from '../../lib/exportPdf';

type Props = {
  searchText: string;
  onSearchText: (v: string) => void;

  showLatLongOnPdf: boolean;
  onShowLatLongOnPdf: (v: boolean) => void;

  projectTitle: string;
  onProjectTitle: (v: string) => void;

  placeholder?: string;

  onPreview: () => void;
  status?: string;
};

export default function AddressForm(props: Props) {
  const { searchText, onSearchText, showLatLongOnPdf, onShowLatLongOnPdf, projectTitle, onProjectTitle, placeholder, onPreview, status } = props;

  return (
    <div className="form-grid">
      <div className="group">
        <div className="row" style={{ gap: 4 }}>
          <label>
            LAT / LONG
          </label>
          <textarea
            className="native-reset"
            rows={2}
            value={searchText}
            onChange={e=>onSearchText(e.target.value)}
            placeholder={placeholder || 'Enter LAT / LONG'}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={showLatLongOnPdf}
              onChange={e => onShowLatLongOnPdf(e.target.checked)}
            />
            Show Lat / Long on PDF
          </label>
        </div>
      </div>

      <div className="group">
        <div className="row" style={{ gap: 4 }}>
          <label>
            PROJECT NAME <span style={{ color:'#9ca3af', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            className="native-reset"
            value={projectTitle}
            onChange={e=>onProjectTitle(e.target.value)}
            placeholder="Add project name to PDF"
          />
        </div>
      </div>

      <div className="group">
        <div className="row">
          <label>QUICK LINKS</label>
          <a href="https://gispublic.waterboards.ca.gov/portal/apps/experiencebuilder/experience/?id=26961aabd2854bd7bfbb00328e45a059" target="_blank" rel="noreferrer">LS Factor (New Map GIS, State Water Board)</a>
          <a href="https://gispublic.waterboards.ca.gov/portal/apps/experiencebuilder/experience/?id=4ca926e05dad42b1b6ca006b78584f6a" target="_blank" rel="noreferrer">K Factor (New Map GIS, State Water Board)</a>
          <a href="https://www.google.com/maps" target="_blank" rel="noreferrer">Google Maps</a>
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
