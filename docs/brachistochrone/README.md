# Brachistochrone visualization

A dependency-free, client-side visualization comparing the brachistochrone cycloid with the straight-line path between the same endpoints.

## Run locally

From the repository root:

```sh
python3 -m http.server 8000 --directory docs
```

Then open <http://localhost:8000/brachistochrone/>.

## Current scope

- Adjust the horizontal distance and vertical drop.
- Compare the cycloid and straight-line travel times.
- Animate beads released simultaneously from rest.
- Show the parametric cycloid that connects the selected endpoints.

The calculation assumes a point mass, uniform gravitational acceleration, no friction, and no rolling energy.
