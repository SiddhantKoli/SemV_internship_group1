PALGHAR / VADHAVAN COASTAL FLOOD PILOT
HEC-RAS 7.0.2 | SI units | EPSG:32643 (WGS 84 / UTM zone 43N)

CURRENT CONTENTS
- palgharcoastalsurgepilot.prj: HEC-RAS project, metric units.
- palgharcoastalsurgepilot.g01: Geometry shell named “Vadhavan Coastal 2D”. It does not yet contain a 2D flow area, mesh, or boundary lines.
- Terrain/Terrain.hdf: terrain imported and registered in RAS Mapper.
- Terrain/Palghar_Vadhavan_SRTM_30m_UTM43N.tif: source raster, 30 m cell size, 850 x 667 cells, approximately 25.5 km x 20 km.
- Terrain/N19E072.hgt(.gz): source SRTM tile downloaded for this preparation.
- Terrain/Projection.prj: project coordinate system created by RAS Mapper after adopting the source raster CRS.

WHAT THIS IS READY FOR
Open the .prj in HEC-RAS 7.0.2 and open RAS Mapper. The terrain should appear under Terrains > Terrain; the geometry shell should appear under Geometries > Vadhavan Coastal 2D. The project units are SI. The terrain source is useful for a first-pass land elevation context and for building a geometry after review.

WHAT IT DOES NOT DO YET
This is not a runnable flood simulation, prediction, or calibrated HEC-RAS model. No 2D flow area, computational mesh, roughness map, boundary condition, unsteady-flow file, or plan has been fabricated. There is no defensible HEC-RAS result to display yet.

LIMITATIONS / REQUIRED INPUTS
1. The SRTM surface is approximately 30 m and is not a surveyed hydraulic terrain model. It can miss narrow channels, embankments, drains, roads, and local barriers.
2. It provides no usable nearshore bathymetry for the offshore area. A coastal surge calculation needs connected bathymetry and topography; do not extend a water boundary over the SRTM offshore nodata or treat the land raster as seafloor.
3. A meaningful scenario needs a defined study-area polygon and reviewed 2D area, cell size/refinement, breaklines, and structure representation.
4. Boundary conditions must be supplied or selected from traceable observed/design data: tide/surge water-level time series at the coast, and upstream inflow hydrographs where relevant. Record source, datum, time zone, event, and uncertainty.
5. Add defensible Manning roughness by land cover, initial conditions, simulation duration/time step, and calibration/validation observations before using results for decisions.

RECOMMENDED NEXT MODELING STEP
Have a coastal/hydraulic reviewer define a smaller Vadhavan–Dahanu onshore study domain and its open boundaries. Obtain an authoritative bathymetric/topographic surface with a common vertical datum, plus a documented tide/surge hydrograph. Then digitize the 2D flow area and breaklines in RAS Mapper, build/refine the mesh, set roughness and boundary conditions, create an unsteady-flow file and plan, compute, and compare against observed high-water extent/levels. Keep every assumed input plainly labeled and sensitivity-test it.

Do not connect this scaffold to the public-facing dashboard as a forecast. Until a plan has computed and passed review, show terrain context only.

