use std::collections::BTreeMap;
use std::ffi::OsString;
use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::{env, process};

use anyhow::{Context, Result, ensure};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Directory {
    name: String,
    configured: Option<PathBuf>,
    suffix: PathBuf,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Configuration {
    directories: Vec<Directory>,
    stage_modules: PathBuf,
    modules_dir: PathBuf,
    deploy_krisp: Option<PathBuf>,
    target: PathBuf,
    command_line_args: Vec<String>,
}

impl Directory {
    fn resolve(&self) -> Result<PathBuf> {
        let configured = self
            .configured
            .as_ref()
            .filter(|path| !path.as_os_str().is_empty())
            .cloned()
            .or_else(|| {
                env::var_os(&self.name)
                    .filter(|value| !value.is_empty())
                    .map(PathBuf::from)
            });
        if let Some(path) = configured {
            ensure!(
                path.is_absolute(),
                "{} must be an absolute path",
                self.name
            );
            return Ok(path);
        }

        let home = PathBuf::from(env::var_os("HOME").unwrap_or_default());
        ensure!(home.is_absolute(), "HOME must be an absolute path");
        ensure!(
            self.suffix.is_relative(),
            "{} default suffix must be relative",
            self.name
        );
        Ok(home.join(&self.suffix))
    }
}

fn run_helper(
    executable: &Path,
    arguments: &[&Path],
    environment: &BTreeMap<String, OsString>,
) -> Result<i32> {
    let status = Command::new(executable)
        .args(arguments)
        .envs(environment)
        .status()
        .with_context(|| format!("failed to run {}", executable.display()))?;
    Ok(status
        .code()
        .or_else(|| status.signal().map(|signal| 128 + signal))
        .unwrap_or(127))
}

fn run() -> Result<i32> {
    // Nix embeds JSON so paths and flags need no source-language escaping
    let config: Configuration = serde_json::from_str(
        option_env!("NIXCORD_LAUNCHER_CONFIG")
            .context("launcher configuration was not embedded at build time")?,
    )
    .context("invalid embedded launcher configuration")?;
    let executable = fs_err::canonicalize(
        env::current_exe().context("cannot locate launcher")?,
    )?;
    let directory = executable.parent().context("missing launcher parent")?;
    // Resolve bundle paths without depending on Discord's output during the
    // build
    let modules = directory.join(config.modules_dir);
    let target = directory.join(config.target);
    let mut environment = BTreeMap::new();
    for directory in &config.directories {
        environment.insert(
            directory.name.clone(),
            directory.resolve()?.into_os_string(),
        );
    }

    // Pass overrides to each child without mutating the process environment
    let status = run_helper(&config.stage_modules, &[&modules], &environment)?;
    if status != 0 {
        return Ok(status);
    }
    if let Some(deploy) = config.deploy_krisp {
        let status = run_helper(&deploy, &[], &environment)?;
        if status != 0 {
            return Ok(status);
        }
    }

    let error = Command::new(&target)
        .args(env::args_os().skip(1))
        .args(config.command_line_args)
        .envs(&environment)
        .exec();
    Err(error).with_context(|| format!("failed to exec {}", target.display()))
}

fn main() {
    let status = match run() {
        Ok(status) => status,
        Err(error) => {
            eprintln!("{error:#}");
            127
        }
    };
    process::exit(status);
}
