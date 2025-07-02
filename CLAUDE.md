You must copy the worklist from todo.md to your own todolist
After each line item, you must check for errors using the most relevant validation pipeline, be it npm build, lint check, type check, or run the gh actions pipeline or do a test deployment on vercel, depends on what stage we are at.
Once it's passed CI locally, push to 'working' branch, then check CI on remote. If it is failing, fix it before doing the next item.
After pushing a feature to remote and it successfully passes all CI on local and remote, update your todolist, todo.md and any documentation including but not limited to the readme, if the feature has changed the way the product works.
You have access to gh on the cli, and vercel on the cli too

Your git repo is: https://github.com/MichaelAyles/AgentTool
Your vercel deployment is: agent-tool-frontend.vercel.app
The end deployment is: vibe.theduck.chat

No OAuth should be needed, database should be part of the desktop connector and stored to user locally.

The user doesn't like answering questions in the command line with you, if you need the user to do something, add it to user-requests.md