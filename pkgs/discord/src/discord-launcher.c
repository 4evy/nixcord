#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <spawn.h>
#include <stdckdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

#define PREPARE_DATA "@prepare_data@"
#define MOD_DATA_ENV "@mod_data_env@"
#define MOD_DATA_SUFFIX "@mod_data_suffix@"
#define STAGE_MODULES "@stage_modules@"
#define MODULES_DIR "@modules_dir@"
#define DEPLOY_KRISP "@deploy_krisp@"
#define TARGET "@target@"
#define ENABLE_KRISP @enable_krisp@

static_assert(__STDC_VERSION__ >= 202311L, "discord-launcher.c requires C23");

extern char **environ;

static char target_path[] = TARGET;

// File-scope compound literals give POSIX argv writable strings with static
// lifetime.
static char *const command_line_args[] = {@command_line_args@
                                          nullptr};
static constexpr size_t command_line_slots =
    sizeof(command_line_args) / sizeof(command_line_args[0]);

struct directory_config {
  const char *name;
  const char *configured;
  const char *suffix;
};

static const struct directory_config directories[] = {
    {.name = "DISCORD_USER_DATA_DIR",
     .configured =
         (const char[]){
#embed "@app_data_dir_file@" suffix(, )
             0},
     .suffix = "/Library/Application Support/nixcord"},
    {.name = MOD_DATA_ENV,
     .configured =
         (const char[]){
#embed "@mod_data_dir_file@" suffix(, )
             0},
     .suffix = MOD_DATA_SUFFIX},
};

static const struct {
  bool enabled;
  char *const *argv;
} helpers[] = {
    {.enabled = true, .argv = (char *const[]){(char[]){PREPARE_DATA}, nullptr}},
    {.enabled = true,
     .argv = (char *const[]){(char[]){STAGE_MODULES}, (char[]){MODULES_DIR},
                             nullptr}},
    {.enabled = ENABLE_KRISP,
     .argv = (char *const[]){(char[]){DEPLOY_KRISP}, nullptr}},
};

[[nodiscard]] static bool set_directory(const char *name, const char *path) {
  if (setenv(name, path, 1) == 0) {
    return true;
  }
  fprintf(stderr, "failed to set %s: %s\n", name, strerror(errno));
  return false;
}

[[nodiscard]] static bool
configure_directory(const struct directory_config *directory) {
  const char *name = directory->name;
  const char *configured = directory->configured;
  const bool inherited = configured[0] == '\0';
  if (inherited) {
    configured = getenv(name);
  }
  if (configured != nullptr && configured[0] != '\0') {
    if (configured[0] != '/') {
      fprintf(stderr, "%s must be an absolute path\n", name);
      return false;
    }
    // An inherited value is already installed; don't pass getenv storage to
    // setenv.
    return inherited || set_directory(name, configured);
  }

  const char *home = getenv("HOME");
  if (home == nullptr || home[0] != '/') {
    fprintf(stderr, "HOME must be an absolute path\n");
    return false;
  }
  const size_t home_length = strlen(home);
  const size_t suffix_length = strlen(directory->suffix);
  size_t size = 0;
  if (ckd_add(&size, home_length, suffix_length) || ckd_add(&size, size, 1)) {
    fprintf(stderr, "path for %s is too large\n", name);
    return false;
  }
  char *path = malloc(size);
  if (path == nullptr) {
    fprintf(stderr, "failed to allocate path for %s: %s\n", name,
            strerror(errno));
    return false;
  }
  memcpy(path, home, home_length);
  memcpy(path + home_length, directory->suffix, suffix_length + 1);
  // Report setenv errors before releasing the temporary buffer.
  const bool result = set_directory(name, path);
  free(path);
  return result;
}

[[nodiscard]] static int wait_for_child(pid_t pid, const char *name) {
  int status = 0;

  for (;;) {
    pid_t waited = waitpid(pid, &status, 0);
    if (waited == pid) {
      break;
    }
    if (waited < 0 && errno == EINTR) {
      continue;
    }
    if (waited < 0) {
      fprintf(stderr, "failed to wait for %s: %s\n", name, strerror(errno));
    } else {
      fprintf(stderr, "waitpid returned unexpected pid for %s\n", name);
    }
    return 127;
  }

  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  if (WIFSIGNALED(status)) {
    return 128 + WTERMSIG(status);
  }
  return 127;
}

[[nodiscard]] static int run_helper(char *const helper_argv[]) {
  pid_t pid = 0;
  int spawn_error = posix_spawn(&pid, helper_argv[0], nullptr, nullptr, helper_argv, environ);
  if (spawn_error != 0) {
    fprintf(stderr, "failed to spawn %s: %s\n", helper_argv[0], strerror(spawn_error));
    return 127;
  }

  return wait_for_child(pid, helper_argv[0]);
}

[[nodiscard]] static char **make_next_argv(int argc, char **argv) {
  // main supplies nonnegative argc (C23 5.1.2.3.2), including possibly zero.
  const size_t base_argc = argc == 0 ? 1 : (size_t)argc;
  size_t next_argc = 0;
  if (ckd_add(&next_argc, base_argc, command_line_slots)) {
    fprintf(stderr, "argv is too large\n");
    return nullptr;
  }

  // C23 7.24.3.2 requires calloc to reject size_t multiplication overflow.
  char **next_argv = calloc(next_argc, sizeof(*next_argv));
  if (next_argv == nullptr) {
    fprintf(stderr, "failed to allocate argv: %s\n", strerror(errno));
    return nullptr;
  }

  next_argv[0] = target_path;
  if (argc > 1) {
    memcpy(next_argv + 1, argv + 1, (base_argc - 1) * sizeof(*next_argv));
  }
  // Copy the typed nullptr too: calloc's zero bits need not be a null pointer.
  memcpy(next_argv + base_argc, command_line_args, sizeof(command_line_args));

  return next_argv;
}

int main(int argc, char **argv) {
  for (size_t i = 0; i < sizeof(directories) / sizeof(directories[0]); i++) {
    if (directories[i].name[0] != '\0' &&
        !configure_directory(&directories[i])) {
      return 127;
    }
  }
  for (size_t i = 0; i < sizeof(helpers) / sizeof(helpers[0]); i++) {
    if (helpers[i].enabled) {
      const int status = run_helper(helpers[i].argv);
      if (status != 0) {
        return status;
      }
    }
  }

  char **next_argv = make_next_argv(argc, argv);
  if (next_argv == nullptr) {
    return 127;
  }

  execv(target_path, next_argv);
  fprintf(stderr, "failed to exec %s: %s\n", target_path, strerror(errno));
  free(next_argv);
  return 127;
}
