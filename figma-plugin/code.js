// ═══════════════════════════════════════════════════════════
// Icon Normalizer — Figma Plugin (code.js)
//
// Reads selected icons, sends SVGs to ui.html for normalization,
// then creates ComponentSets with 16dp/24dp/32dp size variants.
// ═══════════════════════════════════════════════════════════

figma.showUI(__html__, { width: 300, height: 180, themeColors: true });

// ─── Selection Reading ───────────────────────────────────

function isExportableNode(node) {
  return 'exportAsync' in node && node.visible;
}

async function getIconNodes() {
  const sel = figma.currentPage.selection;

  if (sel.length === 0) {
    figma.notify('Please select one or more icons, or a frame containing icons.', { error: true });
    figma.closePlugin();
    return [];
  }

  // If single frame/group selected with children → treat each child as an icon
  if (sel.length === 1 && 'children' in sel[0] && sel[0].children.length > 0) {
    const node = sel[0];
    // Don't unwrap components/instances — treat them as single icons
    if (node.type === 'COMPONENT' || node.type === 'INSTANCE') {
      return [node];
    }
    const children = node.children.filter(isExportableNode);
    if (children.length > 0) {
      return children;
    }
  }

  // Multiple selection or single leaf node: each node is an icon
  return sel.filter(isExportableNode);
}

// ─── SVG Export ──────────────────────────────────────────

async function exportIcons(nodes) {
  const icons = [];
  for (const node of nodes) {
    try {
      const svg = await node.exportAsync({ format: 'SVG_STRING' });
      // Preserve the original layer name as-is (only strip Figma-invalid chars)
      const name = node.name.trim() || 'icon';
      icons.push({ name, svg });
    } catch (e) {
      console.error(`Failed to export "${node.name}":`, e);
    }
  }
  return icons;
}

// ─── Outline & Flatten ──────────────────────────────────

// Three-phase post-processing after createNodeFromSvg:
//   Phase 1: Recursively outline all strokes → fill-only nodes
//   Phase 2: Flatten every child into a single VectorNode
//   Phase 3: Force-clear any remaining strokes on the result
function outlineAndFlatten(comp) {
  // Phase 1: Walk the tree and outline every stroke.
  // outlineStroke() replaces the stroked node with fill-only geometry.
  // We loop until no more stroked nodes remain (outlining can create new structures).
  function collectStrokedNodes(parent) {
    const nodes = [];
    if (!('children' in parent)) return nodes;
    for (const child of parent.children) {
      if ('strokes' in child && child.strokes && child.strokes.length > 0) {
        nodes.push(child);
      }
      if ('children' in child) {
        nodes.push(...collectStrokedNodes(child));
      }
    }
    return nodes;
  }

  // Outline strokes in passes until none remain (max 5 passes as safety)
  for (let pass = 0; pass < 5; pass++) {
    const stroked = collectStrokedNodes(comp);
    if (stroked.length === 0) break;
    for (const node of stroked) {
      if (node.removed) continue;
      try {
        node.outlineStroke();
      } catch (_) {}
    }
  }

  // Phase 2: Flatten all children into a single vector
  if ('children' in comp && comp.children.length > 0) {
    try {
      const flat = figma.flatten([...comp.children], comp);
      // Phase 3: Force-clear any residual strokes on the flattened result
      if (flat && 'strokes' in flat) {
        flat.strokes = [];
        flat.strokeWeight = 0;
      }
    } catch (e) {
      console.warn('flatten failed for', comp.name, e);
    }
  }

  // Safety: clear strokes on ALL remaining children (in case flatten failed)
  if ('children' in comp) {
    for (const child of comp.children) {
      if ('strokes' in child && child.strokes && child.strokes.length > 0) {
        try {
          child.strokes = [];
          child.strokeWeight = 0;
        } catch (_) {}
      }
    }
  }
}

// ─── Output Creation ─────────────────────────────────────

async function createOutput(results) {
  const successResults = results.filter(r => r.error === null);
  const failedResults = results.filter(r => r.error !== null);

  if (successResults.length === 0) {
    figma.notify('All icons failed to normalize. Check console for errors.', { error: true });
    return;
  }

  // Create the output container frame
  const outputFrame = figma.createFrame();
  outputFrame.name = 'Normalized Icons';
  outputFrame.fills = [];  // transparent
  outputFrame.layoutMode = 'HORIZONTAL';
  outputFrame.itemSpacing = 40;
  outputFrame.counterAxisSizingMode = 'AUTO';
  outputFrame.primaryAxisSizingMode = 'AUTO';
  outputFrame.paddingTop = 20;
  outputFrame.paddingBottom = 20;
  outputFrame.paddingLeft = 20;
  outputFrame.paddingRight = 20;

  // Position below the original selection
  const sel = figma.currentPage.selection;
  if (sel.length > 0) {
    let maxY = -Infinity, minX = Infinity;
    for (const node of sel) {
      const box = node.absoluteBoundingBox;
      if (box) {
        if (box.y + box.height > maxY) maxY = box.y + box.height;
        if (box.x < minX) minX = box.x;
      }
    }
    if (maxY > -Infinity) {
      outputFrame.x = minX;
      outputFrame.y = maxY + 80;
    }
  }

  // Create a ComponentSet for each successfully normalized icon
  for (const result of successResults) {
    try {
      await createComponentSet(result, outputFrame);
    } catch (e) {
      console.error(`Failed to create ComponentSet for "${result.name}":`, e);
    }
    // Small delay to keep Figma responsive
    await new Promise(r => setTimeout(r, 5));
  }

  // Report results
  let msg = `Created ${successResults.length} icon(s) as ComponentSets`;
  if (failedResults.length > 0) {
    msg += `. ${failedResults.length} failed.`;
    for (const f of failedResults) {
      console.warn(`Icon "${f.name}" failed: ${f.error}`);
    }
  }
  figma.notify(msg);

  // Select and zoom to the output
  figma.currentPage.selection = [outputFrame];
  figma.viewport.scrollAndZoomIntoView([outputFrame]);
}

async function createComponentSet(result, parentFrame) {
  const sizes = [16, 24, 32];
  const components = [];

  // Derive base name by stripping any trailing size suffix (e.g. "_32", "_24", "_16")
  const baseName = result.name.replace(/[_\-]?(16|24|32)(dp)?$/i, '');

  for (const size of sizes) {
    const svgStr = result.svgs[size];

    // Create a Component for this size variant — named as BaseName_size
    const comp = figma.createComponent();
    comp.name = `${baseName}_${size}`;
    comp.resize(size, size);
    comp.clipsContent = true;
    comp.fills = [];  // transparent background

    // Import the normalized SVG
    try {
      const svgNode = figma.createNodeFromSvg(svgStr);

      // Move all children from the temp SVG frame into our component
      const children = [...svgNode.children];
      for (const child of children) {
        comp.appendChild(child);
      }

      // Remove the temporary frame created by createNodeFromSvg
      svgNode.remove();

      // Outline all strokes + flatten into a single vector shape
      outlineAndFlatten(comp);
    } catch (e) {
      console.error(`createNodeFromSvg failed for ${result.name} at ${size}dp:`, e);
      // Add a placeholder text so the component isn't empty
      const text = figma.createText();
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      text.characters = '?';
      text.fontSize = size * 0.6;
      comp.appendChild(text);
    }

    components.push(comp);
  }

  // Add components to the parent frame first (required by combineAsVariants)
  for (const comp of components) {
    parentFrame.appendChild(comp);
  }

  // Combine into a ComponentSet
  const componentSet = figma.combineAsVariants(components, parentFrame);
  componentSet.name = baseName;

  // Style the component set
  componentSet.layoutMode = 'HORIZONTAL';
  componentSet.itemSpacing = 16;
  componentSet.counterAxisSizingMode = 'AUTO';
  componentSet.primaryAxisSizingMode = 'AUTO';
  componentSet.fills = [];
}

// ─── Main Flow ───────────────────────────────────────────

async function main() {
  const nodes = await getIconNodes();
  if (nodes.length === 0) return;

  figma.notify(`[v3.3] Normalizing ${nodes.length} icon(s)...`);

  const icons = await exportIcons(nodes);

  if (icons.length === 0) {
    figma.notify('No exportable icons found in selection.', { error: true });
    figma.closePlugin();
    return;
  }

  // Send icons to the UI iframe for normalization
  figma.ui.postMessage({ type: 'normalize-icons', icons });
}

// Listen for results from the UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'normalize-results') {
    try {
      await createOutput(msg.results);
    } catch (e) {
      console.error('Output creation failed:', e);
      figma.notify('Failed to create output. Check console.', { error: true });
    }
    figma.closePlugin();
  }
};

// Start
main();
