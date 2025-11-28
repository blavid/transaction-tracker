![CI](https://github.com/blavid/transaction-tracker/actions/workflows/ci.yml/badge.svg)

Transaction-tracker: parse SMS notifications into transaction rows and export for Google Sheets / other workflows.

# Testing

To test locally, ensure that npm is installed and run this command in the project directory:

`npm test`

When code is checked in to Github, tests are run automatically as configured in the `.github/workflows/ci.yml` file.

# Deployment

To deploy this code, log on to [Pipedream.com](pipedream.com). In the **Finance Tracking** project, there is a `Citibank` job. 
Select the `parse_sms` step and edit it. Copy the index.js file from this project and paste it there. Test the job, then
test the workflow. If all goes well, hit the `deploy` button.
