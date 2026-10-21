# Brachistochrone visualization

A dependency-free, client-side visualization for exploring the travel-time functional with editable trial curves.

## Run locally

From the repository root:

```sh
python3 -m http.server 8000 --directory docs
```

Then open <http://localhost:8000/brachistochrone/>.

## Current scope

- Drag four interior control points to create a smooth trial curve.
- Watch a compact copy of the functional and its current value update directly in the plot.
- Work with a fixed 10 m horizontal span and adjust the vertical drop.
- See endpoint changes against fixed, meter-labeled axes.
- Evaluate the travel-time functional for every visible curve, integrating the
  start-point singularity exactly on each sampled segment.
- Compare the trial curve with a straight line.
- Reveal the cycloid solution with an optional checkbox.
- Animate beads released simultaneously from rest.
- Save trial curves, compare their times in a dot plot, and restore a curve by selecting its dot.
- Match saved curves to their history dots with a stable color palette.
- Batch-add only new saved trials to a browser-local class histogram, separated by vertical endpoint.
- Clear personal saved trials without changing previously submitted class results.
- Keep class-histogram bins fixed at 0.10 s and scroll horizontally to inspect outliers.
- Open the page with `?teacher=1` to reveal the class-histogram reset control.

The published page sends class results to the companion Cloudflare Worker configured in `config.js`,
so submissions are shared across devices. Leaving `apiBaseUrl` empty restores browser-local fallback
mode. Worker setup and deployment instructions are in
[`../../cloudflare/README.md`](../../cloudflare/README.md).

The calculation assumes a point mass, uniform gravitational acceleration, no friction, and no rolling energy.
