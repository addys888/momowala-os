import { useEffect, useRef } from 'react';

// Keep keyboard focus inside the daily task and prevent background scrolling.
export function DailyOpeningModal({children}) {
  const ref=useRef(null);
  useEffect(()=>{
    const previous=document.activeElement, overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';ref.current?.focus();
    const trap=e=>{
      if(e.key!=='Tab')return;
      const fields=Array.from(ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),summary,[tabindex="0"]')).filter(x=>x.getClientRects().length);
      const first=fields[0],last=fields[fields.length-1];
      if(!first){e.preventDefault();return;}
      if(e.shiftKey && (document.activeElement===first || document.activeElement===ref.current)){e.preventDefault();last.focus();}
      else if(!e.shiftKey && (document.activeElement===last || document.activeElement===ref.current)){e.preventDefault();first.focus();}
    };
    const box=ref.current;box.addEventListener('keydown',trap);
    return()=>{document.body.style.overflow=overflow;box.removeEventListener('keydown',trap);previous?.focus?.();};
  },[]);
  return <div className="daily-opening-overlay"><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Prepare opening stock" className="daily-opening-modal">{children}</div></div>;
}
