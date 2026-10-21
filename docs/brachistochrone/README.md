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
- Adjust the horizontal distance and vertical drop.
- Evaluate the travel-time functional for every visible curve.
- Compare the trial curve with a straight line.
- Reveal the cycloid solution with an optional checkbox.
- Animate beads released simultaneously from rest.

The calculation assumes a point mass, uniform gravitational acceleration, no friction, and no rolling energy.
