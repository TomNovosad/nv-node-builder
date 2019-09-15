# Node.js application builder
A complete solution to package and build Node.js application ready for Docker container, Linux service and Windows service.

## Requirements
- Node.js >= 10.12.0

## Installation
Install package globally:

```
$ npm install nv-node-builder -g
```

## Configuration

Add a `builder` property to your package.json. 

See the example below:
```json
"builder": {
  "dirs": {
    "build": "./build",
    "src": "./dist"
  },
  "node": "10.12.0",
  "entry": "app.js",
  "environments": [
    "docker",
    "windows-x64",
    "linux-x64"
  ],
  "copy": [
    {
      "from": "./dist/config.json",
      "to": "./config.json"
    }
  ],
  "docker": {
    "externals": [
      "mongodb",
      "redis"
    ],
    "image": "12.10.0-stretch",
    "restart": "no",
    "volumes": [
      {
        "hostPath": "./log",
        "servicePath": "/usr/src/app/log"
      }
    ],
    "ports": [
      {
        "hostPort": 80,
        "containerPort": 8000
      }
    ]
  }
}
```

- **dirs**
   - **build:** path to the directory, where the build will be.
   - **src:** path to the directory, where your application files are.
- **node:** Node.js version, which will be used for binaries (please refer to https://github.com/nexe/nexe/releases).
- **entry:** entry file for your application.
- **copy:** an array of files that can be copied to an build. _Optional_.
  - **from:** path to the source of file.
  - **to:** path to the target of file.
- **environments:** array of environments for which the build will take place (supported: `linux-x64`, `windows-x64`, `docker`). 
- **docker:**
  - **image:** container, on which will be your application container based on. _Optional_. Default: `node:10-alpine`
  - **externals:** list of containers which will be linked. _Optional_.
  - **workdir:** the directory in the application container where the application will run. _Optional_. Default: `/usr/src/app`
  - **run:** the array of commands that are executed when the container is initialized, _Optional_. Default: `["node","YOUR_APP_SHORTCUT.js"]`
  - **cmd:** specifies the command to run in the container. _Optional_.
  - **restart:** container restart policy. _Optional_. Default: `always`. Values: `always`, `no`, `on-failure` or `unless-stopped`.
  - **volumes:** _Optional_
    - **hostPath:** specifies path on the host file system. 
    - **servicePath:** specifies path in the container file system.
  - **ports:** _Optional_
    - **hostPort:** specifies port on the host file system.
    - **containerPort:** specifies port in the container file system.



  
