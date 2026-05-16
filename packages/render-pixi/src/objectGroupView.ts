// PIXI v8 view for an `ObjectGroup`. Renders shape-only objects with
// `Graphics`, tile-objects with `Sprite`, and text-objects with `BitmapText`
// (falls back to `Text` when no bitmap font is provided).

import {
  type ObjectGroup,
  type MapObject,
  type Map as TiledMap,
  MapObjectShape,
  ObjectGroupDrawOrder,
} from '@tiled-ts/core';
import { Container, Graphics, Sprite, Text } from 'pixi.js';

import { tileTransformFor } from './tileTransform.js';
import { TextureCache } from './textureCache.js';

export class ObjectGroupView extends Container {
  constructor(
    public readonly objectGroup: ObjectGroup,
    public readonly map: TiledMap,
    private readonly textures: TextureCache,
  ) {
    super();
    this.label = `ObjectGroupView(${objectGroup.name})`;
    this.alpha = objectGroup.opacity;
    this.visible = objectGroup.visible;
    this.position.set(
      objectGroup.x * map.tileWidth + objectGroup.offset.x,
      objectGroup.y * map.tileHeight + objectGroup.offset.y,
    );
  }

  refresh(): void {
    this.removeChildren();
    const objects =
      this.objectGroup.drawOrder === ObjectGroupDrawOrder.TopDownOrder
        ? [...this.objectGroup.objects].sort((a, b) => a.y - b.y)
        : this.objectGroup.objects;

    for (const obj of objects) {
      if (!obj.visible) continue;
      this.addChild(this.viewFor(obj));
    }
  }

  private viewFor(obj: MapObject): Container {
    if (obj.isTileObject()) return this.tileObjectView(obj);
    if (obj.shape === MapObjectShape.Text) return this.textObjectView(obj);
    return this.shapeObjectView(obj);
  }

  private tileObjectView(obj: MapObject): Container {
    const c = new Container();
    const cell = obj.cell;
    const tile = cell.tile()?.currentFrameTile();
    if (!tile || !cell.tileset) return c;
    const tex = this.textures.textureForTileId(cell.tileset, tile.id);
    const sprite = new Sprite(tex);
    // Tiled tile-objects anchor at bottom-left by default for orthogonal maps.
    sprite.anchor.set(0, 1);
    sprite.position.set(obj.x, obj.y);
    sprite.rotation = (obj.rotation * Math.PI) / 180;
    sprite.alpha = obj.opacity;
    // Apply flip-flags exactly as for tile layers.
    const t = tileTransformFor(cell, { width: obj.width || tile.width, height: obj.height || tile.height });
    sprite.scale.set(t.scaleX, t.scaleY);
    c.addChild(sprite);
    return c;
  }

  private shapeObjectView(obj: MapObject): Container {
    const g = new Graphics();
    const stroke = { color: this.objectGroup.color ?? 0xff00ff, width: 2 };

    switch (obj.shape) {
      case MapObjectShape.Rectangle:
        g.rect(0, 0, obj.width, obj.height).stroke(stroke);
        break;
      case MapObjectShape.Ellipse:
        g.ellipse(obj.width / 2, obj.height / 2, obj.width / 2, obj.height / 2).stroke(stroke);
        break;
      case MapObjectShape.Point:
        g.circle(0, 0, 4).stroke(stroke);
        break;
      case MapObjectShape.Polygon: {
        const pts = obj.polygon;
        if (pts.length > 0) {
          g.moveTo(pts[0]!.x, pts[0]!.y);
          for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
          g.closePath();
          g.stroke(stroke);
        }
        break;
      }
      case MapObjectShape.Polyline: {
        const pts = obj.polygon;
        if (pts.length > 0) {
          g.moveTo(pts[0]!.x, pts[0]!.y);
          for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
          g.stroke(stroke);
        }
        break;
      }
      case MapObjectShape.Capsule:
        g.roundRect(0, 0, obj.width, obj.height, Math.min(obj.width, obj.height) / 2).stroke(stroke);
        break;
      case MapObjectShape.Text:
        break;
    }
    g.position.set(obj.x, obj.y);
    g.rotation = (obj.rotation * Math.PI) / 180;
    g.alpha = obj.opacity;
    return g;
  }

  private textObjectView(obj: MapObject): Container {
    const t = obj.textData;
    const text = new Text({
      text: t.text,
      style: {
        fontFamily: t.font.family,
        fontSize: t.font.pixelSize,
        fill: t.color,
        fontStyle: t.font.italic ? 'italic' : 'normal',
        fontWeight: t.font.bold ? 'bold' : 'normal',
        wordWrap: t.wordWrap,
        wordWrapWidth: obj.width,
        align: t.horizontalAlignment,
      },
    });
    text.position.set(obj.x, obj.y);
    text.rotation = (obj.rotation * Math.PI) / 180;
    text.alpha = obj.opacity;
    return text;
  }
}
