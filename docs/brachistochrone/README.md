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
- Collect a browser-local class histogram, separated by vertical endpoint.
- Open the page with `?teacher=1` to reveal the class-histogram reset control.

The class histogram is a shared-device prototype. GitHub Pages has no server-side storage or secure
teacher authentication, so aggregating submissions across student devices would require a backend.

The calculation assumes a point mass, uniform gravitational acceleration, no friction, and no rolling energy.
