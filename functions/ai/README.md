# Bundled review model

`model-edom.json` and `sentiment.js` are the review worker's bundled model and
pure JavaScript inference code. They live under the configured Firebase
Functions source directory (`functions/`) so Firebase includes them in the
deployment package. Inference runs inside the function process and does not
call an external model service.

The model metadata identifies an experimental EDOM research baseline trained
from student lecturer-evaluation comments in the public [EDOM sentiment
repository](https://github.com/samfch/edom-sentiment). It has not been
validated on practicum reviews. The worker passes only the review text to the
classifier and stores the normalized `positive`, `neutral`, or `negative` enum
together with model version `edom-linear-svc-v1-research-baseline`.

The upstream model source is described as MIT licensed. The repository does
not currently include a separate upstream license or attribution file; add
those files from the source repository before distributing the model outside
this project.
