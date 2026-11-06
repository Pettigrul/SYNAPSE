# Sink Pattern Catalog — Global Reference
_Last updated: 2026-06-25_

Quick-reference for dangerous function calls (sinks) by language and vulnerability class. Used by `code-review.md` techniques T1 and T11.

## Command Injection / RCE
| Language | Sinks |
|----------|-------|
| Python | `eval()`, `exec()`, `subprocess.*`, `os.system()`, `os.popen()`, `os.execv*()`, `commands.getoutput()`, `__import__()`, `compile()` |
| JavaScript | `eval()`, `child_process.exec/spawn`, `Function()`, `vm.runIn*()`, `setTimeout(string)`, `setInterval(string)` |
| Java | `Runtime.exec()`, `ProcessBuilder`, `ScriptEngine.eval()` |
| C# | `Process.Start()`, `PowerShell.Create()`, `CSharpCodeProvider.CompileAssembly*()` |
| PHP | `eval()`, `exec()`, `system()`, `passthru()`, `shell_exec()`, `popen()`, `proc_open()`, `` ` `` (backticks) |
| Go | `exec.Command()`, `os/exec` |
| Ruby | `system()`, `exec()`, `` ` ``, `Open3.*`, `IO.popen()`, `Kernel.exec()` |

## SQL Injection
| Language | Sinks |
|----------|-------|
| Python | `cursor.execute(f"...")`, `.execute("..." + var)`, `.execute("..." % var)`, `raw()`, `extra()` |
| JavaScript | `connection.query("..." + var)`, `knex.raw(...)`, `sequelize.query(...)` |
| Java | `Statement.execute*("..." + var)`, `PreparedStatement` with concat (rare) |
| C# | `SqlCommand("..." + var)`, `ExecuteReader/NonQuery` with concat |
| PHP | `mysql_query("..." . $var)`, `PDO::query("..." . $var)` without prepare |

## XSS / Template Injection
| Language | Sinks |
|----------|-------|
| JavaScript (client) | `innerHTML`, `outerHTML`, `.html()`, `document.write()`, `insertAdjacentHTML()`, `DOMParser` |
| Python (Jinja2) | `|safe`, `Markup()`, `render_template_string()` |
| Java (JSP) | `<%= var %>` (unescaped), `out.println()` |
| PHP | `echo $var` (without `htmlspecialchars`), `<?= $var ?>` |
| Ruby (ERB) | `<%= raw(var) %>`, `html_safe` |

## Deserialization
| Language | Sinks |
|----------|-------|
| Python | `pickle.loads/load()`, `yaml.load()` (without SafeLoader), `marshal.loads()`, `jsonpickle.decode()`, `shelve.open()` |
| Java | `ObjectInputStream.readObject()`, `XMLDecoder`, `XStream.fromXML()`, `JSON.parseObject()` (fastjson) |
| C# | `BinaryFormatter`, `SoapFormatter`, `LosFormatter`, `ObjectStateFormatter`, `NetDataContractSerializer`, `JavaScriptSerializer` |
| PHP | `unserialize()` with user data, `__wakeup()` / `__destruct()` gadget chains |
| Ruby | `Marshal.load()`, `YAML.load()` (without safe_load) |

## File Operations (Path Traversal)
| Language | Sinks |
|----------|-------|
| Python | `open(user_path)`, `os.path.join()` with user input, `shutil.*()`, `send_file()`, `send_from_directory()` |
| JavaScript | `fs.readFile/writeFile()`, `fs.createReadStream()`, `path.join()` with user input, `res.sendFile()` |
| Java | `new File(user_input)`, `FileInputStream/OutputStream`, `Files.read/write()`, `Path.resolve()` |
| C# | `File.Read/Write*()`, `Path.Combine()`, `StreamReader/Writer` |

## SSRF
| Language | Sinks |
|----------|-------|
| Python | `requests.get(user_url)`, `urllib.urlopen(user_url)`, `urllib3.PoolManager().request('GET', user_url)` |
| JavaScript | `fetch(user_url)`, `axios.get(user_url)`, `http.request()`, `got()` |
| Java | `URL.openConnection()`, `HttpClient.send()`, `RestTemplate.getForObject()` |
| C# | `HttpClient.GetAsync(user_url)`, `WebClient.DownloadString()` |

## Redirect
| Language | Sinks |
|----------|-------|
| Python | `redirect(user_url)`, `Response(status=302, headers={'Location': user_url})` |
| JavaScript | `res.redirect(user_url)`, `window.location = user_url` |
| Java | `response.sendRedirect(user_url)`, `RequestDispatcher.forward()` |
| PHP | `header("Location: " . $user_url)` |

## Crypto Misuse
| Pattern | Issue |
|---------|-------|
| `MD5`, `SHA1` for passwords | Use bcrypt/scrypt/argon2 |
| `DES`, `3DES`, `RC4` | Use AES-256-GCM |
| `ECB` mode | Use CBC/GCM with unique IV |
| `random()` / `Math.random()` for tokens | Use `secrets` / `crypto.randomBytes` |
| Hardcoded key/IV/salt | Must be generated per-use or from KDF |
| `verify=False` / `VERIFY_NONE` | TLS verification disabled |
