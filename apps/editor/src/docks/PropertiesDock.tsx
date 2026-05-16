// Properties dock — full editable property bag for the current selection.
//
// Selection priority: first selected object > current layer > the map itself.

import type { TiledObject } from '@tiled-ts/core';

import { useActiveDoc, useEditor } from '../state/editorStore.js';
import { PropertyEditor } from '../components/PropertyEditor.js';

export function PropertiesDock(): JSX.Element {
  const doc = useActiveDoc();
  const propertyTypes = useEditor((s) => s.propertyTypes);
  useEditor((s) => s.version); // re-render on every store invalidation

  let target: TiledObject | undefined;
  let label = 'Map';
  if (doc) {
    const selected = doc.selectedObjects.values().next().value;
    if (selected) {
      target = selected as TiledObject;
      label = `Object ${(selected as { id: number }).id}`;
    } else if (doc.currentLayer()) {
      target = doc.currentLayer();
      label = `Layer "${doc.currentLayer()!.name}"`;
    } else {
      target = doc.map;
    }
  }

  return (
    <div className="dock">
      <div className="dock-title">Properties — {label}</div>
      <div className="dock-body">
        {!doc || !target ? (
          <div style={{ color: 'var(--text-1)' }}>No map open.</div>
        ) : (
          <PropertyEditor doc={doc} target={target} propertyTypes={propertyTypes} />
        )}
      </div>
    </div>
  );
}
