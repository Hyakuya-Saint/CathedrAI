cmake_minimum_required(VERSION 3.22.1)
project(cathedrai LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# The Gradle "debug" variant would otherwise build llama.cpp with -O0, which is
# unusably slow for inference. Always optimise the engine.
set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -O3")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3")

if(NOT DEFINED LLAMA_DIR)
  message(FATAL_ERROR "LLAMA_DIR is not set (path to the llama.cpp checkout)")
endif()
if(NOT DEFINED CATHEDRAI_ARM_ARCH)
  set(CATHEDRAI_ARM_ARCH "armv8.2-a+dotprod")
endif()

# ---- llama.cpp, built statically straight into libcathedrai.so ----
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_CPU_ARM_ARCH "${CATHEDRAI_ARM_ARCH}" CACHE STRING "" FORCE)

add_subdirectory(${LLAMA_DIR} llama-build)

# Image understanding (libmtmd). The CI retries without it if this ever fails to build:
# creating a file named vision.off next to this CMakeLists switches it off.
set(CATHEDRAI_VISION_ON OFF)
if(NOT EXISTS ${CMAKE_CURRENT_LIST_DIR}/vision.off AND EXISTS ${LLAMA_DIR}/tools/mtmd/CMakeLists.txt)
  add_subdirectory(${LLAMA_DIR}/tools/mtmd mtmd-build)
  set(CATHEDRAI_VISION_ON ON)
endif()

add_library(cathedrai SHARED cathedrai_jni.cpp)
target_include_directories(cathedrai PRIVATE ${LLAMA_DIR}/include ${LLAMA_DIR}/ggml/include)
target_link_libraries(cathedrai PRIVATE llama ggml log android)

if(CATHEDRAI_VISION_ON)
  target_compile_definitions(cathedrai PRIVATE CATHEDRAI_VISION=1)
  target_include_directories(cathedrai PRIVATE ${LLAMA_DIR}/tools/mtmd)
  target_link_libraries(cathedrai PRIVATE mtmd)
  message(STATUS "CathedrAI: image support ON")
else()
  message(STATUS "CathedrAI: image support OFF")
endif()
