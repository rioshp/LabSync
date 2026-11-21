# Bundled review model

`model-edom.json` and `sentiment.js` contain the model and its JavaScript
inference code. LabSync runs the model on the device when a student submits a
review. The classifier receives the review text only.

The model metadata identifies an experimental EDOM research baseline trained
from student lecturer-evaluation comments in the public [EDOM sentiment
repository](https://github.com/samfch/edom-sentiment). It has not been
validated on practicum reviews. LabSync stores a normalized label and the
model version `edom-linear-svc-v1-research-baseline`.

The upstream model source is described as MIT licensed. The repository does
not currently include a separate upstream license or attribution file; add
those files from the source repository before distributing the model outside
this project.
