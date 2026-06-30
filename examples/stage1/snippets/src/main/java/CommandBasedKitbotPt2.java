import org.wpilib.command3.Command;
import org.wpilib.command3.Mechanism;
import org.wpilib.command3.Scheduler;
import org.wpilib.drive.DifferentialDrive;
import org.wpilib.hardware.imu.OnboardIMU;
import org.wpilib.opmode.PeriodicOpMode;

import static org.wpilib.units.Units.Seconds;

void main() {}

class ExamplesStore extends PeriodicOpMode {
  private final Command myAutoCommand = null;

  // [startMethod]
  @Override
  public void start() {
    Scheduler.getDefault().schedule(myAutoCommand);
  }
  // [/startMethod]

  public ExamplesStore(Robot robot) {
    DoubleSupplier forwardThrottle = null, rotationThrottle = null;

    // [driveCommand]
    robot.drivetrain.arcadeDrive(forwardThrottle, rotationThrottle);
    // [/driveCommand]

    // [4SecDriveCommand]
    robot.drivetrain.arcadeDrive(forwardThrottle, rotationThrottle)
      .withTimeout(Seconds.of(4));
    // [/4SecDriveCommand]
  }
}

class Robot {
  ExampleDriveMechanism drivetrain = new ExampleDriveMechanism();
}

class ExampleDriveMechanism implements Mechanism {
  private final OnboardIMU imu = new OnboardIMU(OnboardIMU.MountOrientation.FLAT);
  private final DifferentialDrive differentialDrive =
    new DifferentialDrive(_ -> {}, _ -> {});

  Command arcadeDrive(DoubleSupplier forwardThrottle, DoubleSupplier rotationThrottle) {
    return run(coroutine -> {
      // [arcadeDriveBody]
      while (true) {
        differentialDrive.arcadeDrive(
          forwardThrottle.getAsDouble(), 
          rotationThrottle.getAsDouble()
        );
        coroutine.yield();
      }
      // [/arcadeDriveBody]
    })
      .named("Drive");
  }

  Command rotateInPlaceHint(double angleDegrees) {
    return run(coroutine -> {
      // [rotateInPlaceBody]
      double targetAngle = imu.getRotation2d().getDegrees() + angleDegrees;
      while (true) {
        // What to add here?
        coroutine.yield();
      }
      // [/rotateInPlaceBody]
    })
      .named("RotateInPlace");
  }
}